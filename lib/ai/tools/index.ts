import { type ToolRuntime, tool } from 'langchain';
import { z } from 'zod';
import { firecrawlFetchUrl, firecrawlSearch } from './firecrawl';

/**
 * Live web search (Firecrawl). Results stay on the calling agent's
 * message list — register this on the parent so follow-ups still see hits.
 *
 * The Web search pin is `configurable.webSearchEnabled`. Off → structured
 * error, not a throw, so the model can answer from memory instead of crashing.
 */
export const firecrawlFetchUrlTool = tool(
    async (input, config: ToolRuntime) => {
        const urls = input.urls;
        const writer = config.writer;

        if (!isWebSearchEnabled(config)) {
            return {
                pages: [],
                error: 'Web search is off. Enable the Web search pin, or answer from snippets already in this thread. Do not invent URLs.',
            };
        }

        writer?.({
            type: 'progress',
            id: `fetch-${urls.slice(0, 2).join(',')}`,
            message: `Reading ${urls.length} page${urls.length === 1 ? '' : 's'}`,
            step: 'scrape',
        });

        const output = await firecrawlFetchUrl(urls);

        writer?.({
            type: 'progress',
            id: `fetch-${urls.slice(0, 2).join(',')}`,
            message: output.error
                ? 'Could not read those pages'
                : `Read ${output.pages.filter((page) => page.markdown).length} page${output.pages.length === 1 ? '' : 's'}`,
            step: 'done',
        });

        return output;
    },
    {
        name: 'firecrawl_fetch_url_tool',
        description:
            'Read the live page body for specific http(s) URLs and return clipped markdown. Use URLs from a previous internet_search in this thread, or URLs the user pasted. After search, call this when snippets are not enough (quotes, methods, numbers). Do not invent URLs. Do not use this instead of internet_search. Max 3 URLs per call.',
        schema: z.object({
            urls: z
                .array(z.string())
                .min(1)
                .max(3)
                .describe(
                    'http(s) URLs from internet_search results in this thread, or pasted by the user.',
                ),
        }),
    },
);

export const webSearch = tool(
    async (input, config: ToolRuntime) => {
        const query = input.query.trim();
        const writer = config.writer;

        if (!isWebSearchEnabled(config)) {
            return {
                query,
                results: [],
                error: 'Web search is off. Enable the Web search pin, or answer from what you already know in this thread. Do not invent URLs.',
            };
        }

        writer?.({
            type: 'progress',
            id: `search-${query.slice(0, 48)}`,
            message: input.scrape
                ? `Searching and reading pages for “${query}”`
                : `Searching the web for “${query}”`,
            step: 'search',
        });

        const output = await firecrawlSearch(query, { scrape: input.scrape });

        writer?.({
            type: 'progress',
            id: `search-${query.slice(0, 48)}`,
            message: output.error
                ? 'Search finished with no usable results'
                : `Found ${output.results.length} result${output.results.length === 1 ? '' : 's'}`,
            step: 'done',
        });

        return output;
    },
    {
        name: 'internet_search',
        description:
            'Search the live web. Returns { query, results: [{ title, url, snippet }] } or { error }. Write a specific query (names, dates, constraints). Cite the returned URLs. Do not invent sources. Set scrape=true only when snippets are not enough to answer.',
        schema: z.object({
            query: z
                .string()
                .describe(
                    'Focused search-box query. Include names, dates, and constraints.',
                ),
            scrape: z
                .boolean()
                .optional()
                .describe(
                    'If true, also fetch short page excerpts. Use only when titles/snippets are insufficient.',
                ),
        }),
    },
);

function isWebSearchEnabled(config: ToolRuntime): boolean {
    const nested = config.config?.configurable as
        | { webSearchEnabled?: boolean }
        | undefined;
    const direct = (config as { configurable?: { webSearchEnabled?: boolean } })
        .configurable;
    return Boolean(direct?.webSearchEnabled ?? nested?.webSearchEnabled);
}

/**
 * LangChain weather tool. Compact JSON stays on the parent message list
 * so follow-ups ("humidity?") can use it without calling the tool again.
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
