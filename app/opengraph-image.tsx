import { siteConfig } from '@/lib/site';
import { ImageResponse } from 'next/og';

export const alt = `${siteConfig.name} — ${siteConfig.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
    return new ImageResponse(
        (
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    background: '#efe4d0',
                    color: '#24180f',
                    fontFamily: 'Georgia, serif',
                    position: 'relative',
                }}
            >
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: 14,
                        height: '100%',
                        background: '#b34a22',
                    }}
                />
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        padding: '72px 88px',
                        width: '100%',
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                        }}
                    >
                        <div
                            style={{
                                fontSize: 22,
                                letterSpacing: '0.32em',
                                textTransform: 'uppercase',
                                color: '#b34a22',
                                fontFamily: 'ui-monospace, monospace',
                            }}
                        >
                            Research desk
                        </div>
                        <div
                            style={{
                                marginTop: 28,
                                fontSize: 92,
                                lineHeight: 0.95,
                                letterSpacing: '-0.04em',
                            }}
                        >
                            Atelier
                        </div>
                        <div
                            style={{
                                marginTop: 28,
                                maxWidth: 760,
                                fontSize: 30,
                                lineHeight: 1.4,
                                color: '#5c4a38',
                            }}
                        >
                            A streaming research assistant for psychology —
                            emotion, memory, and cognition, live in Markdown.
                        </div>
                    </div>
                    <div
                        style={{
                            display: 'flex',
                            fontSize: 20,
                            letterSpacing: '0.18em',
                            textTransform: 'uppercase',
                            color: '#3f4f3c',
                            fontFamily: 'ui-monospace, monospace',
                        }}
                    >
                        Field notes · Vol. 01
                    </div>
                </div>
            </div>
        ),
        { ...size },
    );
}
