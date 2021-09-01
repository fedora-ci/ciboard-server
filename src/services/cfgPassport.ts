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
import { Strategy as SamlStrategy } from 'passport-saml';
import { getcfg } from '../cfg';
const cfg = getcfg();

function userSerializer(
  user: Express.User | false | null,
  done: (err: any, user?: Express.User | false | null) => void
) {
  done(null, user);
}
passport.serializeUser(userSerializer);

function userDeSerializer(
  user: Express.User | false | null,
  done: (err: any, user?: Express.User | false | null) => void
) {
  done(null, user);
}
passport.deserializeUser(userDeSerializer);
function AddSamlStrategy() {
  const samlStrategy = new SamlStrategy(cfg.authz.saml, function (
    req,
    profile,
    done
  ) {
    return done(null, {
      nameID: profile?.nameID,
      displayName: profile?.cn,
      Role: profile?.Role,
    });
  });

  passport.use(samlStrategy);
  return samlStrategy;
}

export const samlStrategy = AddSamlStrategy();
