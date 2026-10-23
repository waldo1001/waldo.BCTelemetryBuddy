/**
 * HTTP mode request guard — spec docs/specs/147-mcp-http-origin-host-token.md
 *
 * HTTP mode's only legitimate client is the VS Code extension (Node, no browser
 * origin). Refuse browser requests (Origin), DNS rebinding (Host, loopback bind
 * only) and, when BCTB_HTTP_TOKEN is set, requests without the shared token.
 */
import * as crypto from 'crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { HostKind } from './httpBind.js';

export type RejectReason = 'origin' | 'host' | 'token';

export interface HttpGuardOptions {
    bindKind: () => HostKind;
    token: () => string | undefined;
    log: (line: string) => void;
    onReject: (reason: RejectReason) => void;
}

const REJECTIONS: Record<RejectReason, { status: number; error: string }> = {
    origin: { status: 403, error: 'origin_not_allowed' },
    host: { status: 403, error: 'host_not_allowed' },
    token: { status: 401, error: 'unauthorized' }
};

export function normalizeToken(value: string | undefined): string | undefined {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
}

export function isLoopbackHostHeader(hostHeader: string | undefined): boolean {
    if (!hostHeader) {
        return false;
    }
    const h = hostHeader.trim().toLowerCase();
    // [::1] or [::1]:port
    if (/^\[::1\](:\d+)?$/.test(h)) {
        return true;
    }
    const name = h.replace(/:\d+$/, '');
    return name === 'localhost' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(name);
}

function digest(value: string): Buffer {
    return crypto.createHash('sha256').update(value, 'utf8').digest();
}

export function tokenMatches(header: string | undefined, token: string): boolean {
    // Plain string parsing, no regex on the user-supplied header (CodeQL js/polynomial-redos)
    const value = header?.trim() ?? '';
    if (value.slice(0, 7).toLowerCase() !== 'bearer ') {
        return false;
    }
    const presented = value.slice(7).trim();
    if (!presented) {
        return false;
    }
    // Equal-length digests: constant-time compare without leaking the token length
    return crypto.timingSafeEqual(digest(presented), digest(token));
}

export function createHttpGuard(opts: HttpGuardOptions): RequestHandler {
    const reported = new Set<RejectReason>();

    const reject = (req: Request, res: Response, reason: RejectReason): void => {
        try {
            const path = req.path.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
            opts.log(`⛔ HTTP ${req.method} ${path} refused (${reason})`);
        } catch {
            // Ignore: logging must never break the response
        }
        if (!reported.has(reason)) {
            reported.add(reason);
            try {
                opts.onReject(reason);
            } catch {
                // Ignore: telemetry must never break the response
            }
        }
        const { status, error } = REJECTIONS[reason];
        res.status(status).json({ error });
    };

    return (req: Request, res: Response, next: NextFunction) => {
        if (req.headers.origin !== undefined) {
            return reject(req, res, 'origin');
        }
        if (opts.bindKind() === 'loopback' && !isLoopbackHostHeader(req.headers.host)) {
            return reject(req, res, 'host');
        }
        const token = normalizeToken(opts.token());
        if (token && !tokenMatches(req.headers.authorization, token)) {
            return reject(req, res, 'token');
        }
        next();
    };
}
