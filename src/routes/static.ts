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

import debug from 'debug';
import express, { Express } from 'express';
const path = require('path');

const log = debug('osci:static');

export default (app: Express) => {
  if (process.env.NODE_ENV === 'production') {
    /**
     * NODE_ENV is set by Heroku
     * 1. production server servers production assets like main.js and main.css
     * express checks if specific file matches request is looking for
     */
    app.use(express.static('frontend'));
    /**
     * 2. Express will server index.html if doesn't recognize router.
     */
    const path = require('path');
    /**
     * catch all case
     */
    app.get('*', (req, res) =>
      res.sendFile(path.resolve(__dirname, 'client', 'build', 'index.html')),
    );
  } else {
    const webRoot = path.resolve(process.cwd(), './webroot/');
    log('Run in devel mode. Web root : %s', webRoot);
    app.use(express.static(webRoot));
    app.get('*', (req, res) =>
      res.sendFile(path.resolve(webRoot, 'index.html')),
    );
  }
};
