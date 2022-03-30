/*
 * This file is part of ciboard-server

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

import debug from 'debug';
import passport from 'passport';
import { VerifyWithoutRequest, Strategy as SamlStrategy } from 'passport-saml';
import { getcfg } from '../cfg';

const cfg = getcfg();
const log = debug('osci:cfgPassport');

type SerializeUserType = Parameters<typeof passport.serializeUser>[0];
const userSerializer: SerializeUserType = (_req, user, done) => {
  /**
   * This function is called on siging to get User as it knows express
   */
  log(' [i] serialize user: %O', user);
  done(null, user);
};
passport.serializeUser(userSerializer);

type DeSerializeUserType = Parameters<typeof passport.deserializeUser>[0];
const userDeSerializer: DeSerializeUserType = (_req, user, done) => {
  log(' [i] de serialize user: %O', user);
  done(null, user as Express.User);
};
passport.deserializeUser(userDeSerializer);

const onSignOn: VerifyWithoutRequest = (profile, done) => {
  /**
   * This function is called on each signon.
   * Here we can verify if logged user is already present in local-db.
   * Based on verification we can call done() correspondingly.
   */
  log(' [i] sigion for: %O', profile?.cn);
  return done(null, {
    nameID: profile?.nameID,
    displayName: profile?.cn,
    Role: profile?.Role,
  });
};

const onLogout: VerifyWithoutRequest = (profile, done) => {};

function AddSamlStrategy() {
  /**
   * This function is called only once, at server start.
   */
  const samlStrategy = new SamlStrategy(cfg.authz.saml, onSignOn);
  passport.use(samlStrategy);
  return samlStrategy;
}

/**
 * This is exported for debugin purpose, for example to get service metadata
 */
export const samlStrategy = AddSamlStrategy();
