/*
 * This file is part of ciboard-server

 * Copyright (c) 2021 Andrei Stepanov <astepano@redhat.com>
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

import passport from 'passport';
import bodyParser from 'body-parser';

import { getcfg } from '../cfg';
import { samlStrategy } from '../services/cfgPassport';
import printify from '../services/printify';
import { Express } from 'express';
import _ from 'lodash';

const cfg = getcfg();

export default function (app: Express) {
  app.get('/debug/auth', function (req, res) {
    /**
     * Ask passport middleware if session is authenticated
     */
    const info: any = {};
    info.cookies = req.cookies;
    info.signedCookies = req.signedCookies;
    if (req.isAuthenticated()) {
      /**
       * req.user - is added by passport middleware
       */
      info.user = printify(req.user);
      info.session = printify(req.session);
    }
    var cert: string;
    if (_.isString(cfg.authz.saml.cert)) {
      cert = cfg.authz.saml.cert;
    } else {
      throw new Error('Configuration error, expecting cert in string form');
    }
    info.spMetadata = samlStrategy.generateServiceProviderMetadata(null, cert);
    res.json(info);
  });

  app.get(
    '/login',
    /**
     * SAML - is auth strategy
     */
    passport.authenticate('saml', {
      failureFlash: true,
      successRedirect: '/',
      failureRedirect: '/login',
    })
  );

  /**
   * This is chain of middle-ware processors for this worklow.
   */
  app.post(
    cfg.authz.saml.callbackUrl?.replace(/^.*\/\/[^\/]+/, '') || '', // /login/callback
    /**
     * Creates req.body for POST: Content-Type: application/x-www-form-urlencoded
     */
    bodyParser.urlencoded({ extended: false }),
    passport.authenticate('saml', {
      failureRedirect: '/',
      failureFlash: true,
    }),
    /**
     * This will be called after passport.authenticate('saml')
     */
    (req, res) => {
      res.redirect('/');
    }
  );

  app.get('/logout', function (req, res) {
    req.logout();
    /*
     * TODO: invalidate session on IP
     */
    res.redirect('/');
  });

  app.get('/current_user', (req, res) => {
    res.send(req.user);
  });
}
