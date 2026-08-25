import { type ToolRuntime, tool } from 'langchain';
import { z } from 'zod';
import { firecrawlSearch } from './firecrawl';

export const webSearch = tool(
    async (input) => {
        const results = await firecrawlSearch(input.query as string);
        console.log('results', results);
        return results;
    },
    {
        name: 'internet_search',
        description: 'Run a web search',
        schema: z.object({
            query: z.string(),
        }),
    },
);

/**
 * LangChain tool registered on the Deep Agent (`lib/ai/agent.ts`).
 *
 * After HITL approve, this return value becomes a tool message. The LLM
 * sees the full object on the next turn — not only temperature — so it can
 * answer wind, humidity, conditions, etc. Keep this JSON-serializable and
 * compact (no raw hourly arrays).
 *
 * `config.writer()` is LangGraph `streamMode: 'custom'`. The adapter
 * maps `{ type: 'progress', ... }` to a `data-progress` part on the
 * assistant message.
 */
export const getWeather = tool(
    async (input, config: ToolRuntime) => {
        const writer = config.writer;
        let latitude: number;
        let longitude: number;
        let place = input.city?.trim() || '';

        if (input.city) {
            writer?.({
                type: 'progress',
                id: `weather-${input.city}`,
                message: `Looking up coordinates for ${input.city}`,
                step: 'geocode',
            });

            const coords = await geocodeCity(input.city);
            if (!coords) {
                return {
                    error: `Could not find coordinates for "${input.city}".`,
                };
            }
            ({ latitude, longitude } = coords);
            place = coords.name;
        } else if (
            input.latitude !== undefined &&
            input.longitude !== undefined
        ) {
            latitude = input.latitude;
            longitude = input.longitude;
        } else {
            return {
                error: 'Provide a city name or both latitude and longitude.',
            };
        }

        writer?.({
            type: 'progress',
            id: `weather-${place || 'coords'}`,
            message: 'Fetching forecast',
            step: 'forecast',
        });

        const params = new URLSearchParams({
            latitude: String(latitude),
            longitude: String(longitude),
            timezone: 'auto',
            current: [
                'temperature_2m',
                'apparent_temperature',
                'relative_humidity_2m',
                'precipitation',
                'weather_code',
                'cloud_cover',
                'wind_speed_10m',
                'wind_direction_10m',
                'is_day',
            ].join(','),
            daily: [
                'weather_code',
                'temperature_2m_max',
                'temperature_2m_min',
                'precipitation_sum',
                'sunrise',
                'sunset',
                'uv_index_max',
            ].join(','),
            forecast_days: '2',
        });

        const response = await fetch(
            `https://api.open-meteo.com/v1/forecast?${params}`,
        );

        if (!response.ok) {
            return { error: 'Weather service did not respond.' };
        }

        const weatherData = (await response.json()) as OpenMeteoForecast;

        writer?.({
            type: 'progress',
            id: `weather-${place || 'coords'}`,
            message: 'Forecast ready',
            step: 'done',
        });

        const current = weatherData.current;
        const daily = weatherData.daily;
        const weatherCode = current?.weather_code;

        return {
            location: {
                name: place || undefined,
                latitude,
                longitude,
                timezone: weatherData.timezone,
            },
            current: {
                observedAt: current?.time,
                temperatureC: current?.temperature_2m,
                feelsLikeC: current?.apparent_temperature,
                humidityPercent: current?.relative_humidity_2m,
                precipitationMm: current?.precipitation,
                cloudCoverPercent: current?.cloud_cover,
                windSpeedKmh: current?.wind_speed_10m,
                windDirectionDeg: current?.wind_direction_10m,
                isDay: current?.is_day === 1,
                weatherCode,
                conditions: describeWeatherCode(weatherCode),
            },
            today: dailySlice(daily, 0),
            tomorrow: dailySlice(daily, 1),
        };
    },
    {
        name: 'get_weather',
        description:
            'Get current weather and a short forecast for a city or lat/lng: temperature, feels-like, humidity, wind, precipitation, cloud cover, conditions, sunrise/sunset, and UV. Use for any weather question, not only temperature.',
        schema: z.object({
            city: z
                .string()
                .describe("City name, e.g. 'Ajmer' or 'San Francisco'")
                .optional(),
            latitude: z.number().optional(),
            longitude: z.number().optional(),
        }),
    },
);

type OpenMeteoForecast = {
    timezone?: string;
    current?: {
        time?: string;
        temperature_2m?: number;
        apparent_temperature?: number;
        relative_humidity_2m?: number;
        precipitation?: number;
        weather_code?: number;
        cloud_cover?: number;
        wind_speed_10m?: number;
        wind_direction_10m?: number;
        is_day?: number;
    };
    daily?: {
        time?: string[];
        weather_code?: number[];
        temperature_2m_max?: number[];
        temperature_2m_min?: number[];
        precipitation_sum?: number[];
        sunrise?: string[];
        sunset?: string[];
        uv_index_max?: number[];
    };
};

function dailySlice(
    daily: OpenMeteoForecast['daily'] | undefined,
    index: number,
) {
    if (!daily?.time?.[index]) return undefined;

    const weatherCode = daily.weather_code?.[index];
    return {
        date: daily.time[index],
        highC: daily.temperature_2m_max?.[index],
        lowC: daily.temperature_2m_min?.[index],
        precipitationMm: daily.precipitation_sum?.[index],
        sunrise: daily.sunrise?.[index],
        sunset: daily.sunset?.[index],
        uvIndexMax: daily.uv_index_max?.[index],
        weatherCode,
        conditions: describeWeatherCode(weatherCode),
    };
}

/** WMO weather interpretation codes used by Open-Meteo. */
function describeWeatherCode(code: number | undefined): string | undefined {
    if (code === undefined) return undefined;

    const labels: Record<number, string> = {
        0: 'Clear sky',
        1: 'Mainly clear',
        2: 'Partly cloudy',
        3: 'Overcast',
        45: 'Fog',
        48: 'Depositing rime fog',
        51: 'Light drizzle',
        53: 'Moderate drizzle',
        55: 'Dense drizzle',
        61: 'Slight rain',
        63: 'Moderate rain',
        65: 'Heavy rain',
        71: 'Slight snow',
        73: 'Moderate snow',
        75: 'Heavy snow',
        80: 'Slight rain showers',
        81: 'Moderate rain showers',
        82: 'Violent rain showers',
        95: 'Thunderstorm',
        96: 'Thunderstorm with slight hail',
        99: 'Thunderstorm with heavy hail',
    };

    return labels[code] ?? `Weather code ${code}`;
}

async function geocodeCity(city: string): Promise<{
    latitude: number;
    longitude: number;
    name: string;
} | null> {
    try {
        const response = await fetch(
            `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`,
        );

        if (!response.ok) {
            return null;
        }

        const data = (await response.json()) as {
            results?: Array<{
                name?: string;
                admin1?: string;
                country?: string;
                latitude: number;
                longitude: number;
            }>;
        };

        const [result] = data.results ?? [];
        if (!result) return null;

        const name = [result.name, result.admin1, result.country]
            .filter(Boolean)
            .join(', ');

        return {
            latitude: result.latitude,
            longitude: result.longitude,
            name,
        };
    } catch {
        return null;
    }
}
