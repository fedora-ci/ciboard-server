/*
 * This file is part of ciboard-server
 *
 * Copyright (c) 2021, 2022 Andrei Stepanov <astepano@redhat.com>
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 3 of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program; if not, write to the Free Software Foundation,
 * Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
 */

import cors from 'cors';
import debug from 'debug';
import express from 'express';
import passport from 'passport';
import * as Sentry from '@sentry/node';

/**
 * express midleware to parse req.body in POST.
 */
import cookieParser from 'cookie-parser';
import cookieSession from 'cookie-session';
import expressPino from 'pino-http';

import { getcfg } from './cfg';
import { logger, sentryBeforeSend } from './logger';

const log = debug('osci:server');
const cfg = getcfg();

var cookieSessionCfg: CookieSessionInterfaces.CookieSessionOptions = {
  /**
   * 2 days
   */
  maxAge: 2 * 24 * 60 * 60 * 1000,
  /** Allow store cookies over HTTP. Useful to debug auth. XXX: This doesn't work. Need to add HTTPS. */
  keys: [cfg.cookieKey],
};

const app = express();

/*
 * Enable Sentry integration. For more details on the Express.js integration
 * and set up, see the documentation:
 * https://docs.sentry.io/platforms/node/guides/express/
 * Note: The Sentry DSN is read automatically from the environment variable
 * SENTRY_DSN, as specified in the DeploymentConfig. If no DSN is specified,
 * this integration does nothing.
 */
Sentry.init({
  beforeSend: sentryBeforeSend,
  integrations: [
    // Enable HTTP calls tracing.
    new Sentry.Integrations.Http({ tracing: true }),
    // Enable Express.js middleware tracing.
    new Sentry.Integrations.Express({ app }),
    // Automatically instrument Node.js libraries and frameworks.
    ...Sentry.autoDiscoverNodePerformanceMonitoringIntegrations(),
  ],
});

/*
 * RequestHandler creates a separate execution context, so that
 * transactions are isolated across requests.
 */
app.use(Sentry.Handlers.requestHandler());
// TracingHandler creates a trace for every incoming request.
app.use(Sentry.Handlers.tracingHandler());

app.use(cors());
if (app.get('env') === 'development') {
  app.set('view options', { pretty: true });
}
/**
 * Add middleware before routes
 * Print logs to console where express is runing, LOG_LEVEL='trace'
 */
const expressLogger = expressPino({ logger, useLevel: 'trace' });
app.use(expressLogger);
/**
 * Creates req.body for POST : Content-Type: application/json
 */
app.use(express.json());
app.use(
  express.urlencoded({
    extended: true,
  }),
);
/**
 * Parse Cookie header and populate req.cookies && req.signedCookies
 */
app.use(cookieParser());
/**
 * Stores the session data on the client within a cookie
 * any visitor will have a session, authenticated or not
 * req.session
 */
app.use(cookieSession(cookieSessionCfg));

/**
 * This will disable etag header for all requests, but not for static contents.
 */
app.set('etag', false);

if (cfg.authz?.enabled && cfg.authz.use_saml) {
  log(' [i] passport js init');
  app.use(passport.initialize());
  /**
   * Set value req.user object to contain the deserialized identity of the user
   */
  app.use(passport.session());
  import('./services/cfgPassport');
  import('./routes/authRoutes').then(({ default: run }) => run(app));
} else {
  log(' [i] skip passport init: not configured');
}

/**
 * Routes
 */
import('./routes/debugInfo').then(({ default: run }) => run(app));
import('./routes/graphql').then(({ default: run }) => run(app));
import('./routes/static').then(({ default: run }) => run(app));
import('./services/kerberos').then(({ default: run }) => run());
import('./services/db');
import('./services/teiid');

/*
 * The Sentry error handler must be enabled before any other error
 * middleware but after all controllers.
 */
app.use(Sentry.Handlers.errorHandler());

log(' [i] Using port: %s', cfg.port);

app.listen(cfg.port);

log(' [i] Server initialized');
