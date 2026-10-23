/**
 * HTTP mode bind address — spec docs/specs/145-mcp-http-localhost-bind.md
 *
 * HTTP mode has no authentication, so it listens on loopback unless the user
 * opts in to another interface with BCTB_HOST or the `host` config key.
 */
import type * as http from 'http';

export const DEFAULT_HTTP_HOST = '127.0.0.1';

export type HostSource = 'env' | 'config' | 'default';
export type HostKind = 'loopback' | 'wildcard' | 'specific';

export interface HttpBindDeps {
    warn: (line: string) => void;
    track: (name: string, props: Record<string, string | number | boolean>) => void;
    commonProps: () => Record<string, string | number | boolean>;
}

function nonEmpty(value: string | undefined): string | undefined {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
}

export function resolveHttpHost(envHost: string | undefined, configHost: string | undefined): { host: string; source: HostSource } {
    const fromEnv = nonEmpty(envHost);
    if (fromEnv) {
        return { host: fromEnv, source: 'env' };
    }
    const fromConfig = nonEmpty(configHost);
    if (fromConfig) {
        return { host: fromConfig, source: 'config' };
    }
    return { host: DEFAULT_HTTP_HOST, source: 'default' };
}

/**
 * BCTB_PORT wins over the config port, like BCTB_HOST over `host`: the extension
 * starts its Command Palette server with BCTB_PORT=52346 even when a
 * .bctb-config.json sets (or defaults) another port.
 */
export function resolveHttpPort(envPort: string | undefined, configPort: number): number {
    const value = envPort?.trim();
    if (value && /^\d{1,5}$/.test(value)) {
        const port = Number(value);
        if (port <= 65535) {
            return port;
        }
    }
    return configPort;
}

export function classifyHost(host: string): HostKind {
    const h = host.trim().toLowerCase();
    if (h === 'localhost' || h === '::1' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) {
        return 'loopback';
    }
    if (h === '0.0.0.0' || h === '::') {
        return 'wildcard';
    }
    return 'specific';
}

export function formatListenUrl(host: string, port: number): string {
    return `http://${host.includes(':') ? `[${host}]` : host}:${port}`;
}

export function formatExposureWarning(url: string, tokenRequired: boolean = false): string {
    const auth = tokenRequired
        ? 'Requests need the BCTB_HTTP_TOKEN bearer token, and travel unencrypted.'
        : 'HTTP mode has no authentication: anyone who can reach it can query your telemetry. Set BCTB_HTTP_TOKEN to require a token.';
    return `⚠️  HTTP mode is listening on ${url}, reachable from other machines on that interface. ${auth} Unset BCTB_HOST / "host" to listen on ${DEFAULT_HTTP_HOST} only.`;
}

/**
 * Starts listening and resolves once the socket is bound; rejects (instead of
 * an unhandled 'error' event) with the host and port in the message.
 */
export function listenHttp(app: { listen: (port: number, host: string) => http.Server }, host: string, port: number): Promise<http.Server> {
    return new Promise((resolve, reject) => {
        const server = app.listen(port, host);
        const onError = (error: NodeJS.ErrnoException) => {
            server.off('listening', onListening);
            reject(new Error(`Cannot listen on ${host}:${port} (${error.code ?? error.message})`));
        };
        const onListening = () => {
            server.off('error', onError);
            resolve(server);
        };
        server.once('error', onError);
        server.once('listening', onListening);
    });
}

/**
 * Warns (stderr) and tracks telemetry when bound to a non-loopback host.
 * Never throws: reporting must not affect server startup.
 */
export function reportHttpBind(deps: HttpBindDeps, host: string, source: HostSource, port?: number, tokenRequired: boolean = false): HostKind {
    const kind = classifyHost(host);
    if (kind === 'loopback') {
        return kind;
    }

    try {
        deps.warn(formatExposureWarning(port === undefined ? host : formatListenUrl(host, port), tokenRequired));
    } catch {
        // Ignore: warning output must never break startup
    }

    try {
        deps.track('Mcp.HttpNonLoopbackBind', {
            ...deps.commonProps(),
            hostSource: source,
            hostKind: kind
        });
    } catch {
        // Ignore: telemetry must never break startup
    }

    return kind;
}
