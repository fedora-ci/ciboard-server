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

import axios, { AxiosInstance, RawAxiosRequestHeaders } from 'axios';
import debug from 'debug';
import kerberos from 'kerberos';
import axios_debug_log from 'axios-debug-log';
import { URL } from 'url';

const { getcfg } = require('../cfg');
const cfg = getcfg();

const log = debug('osci:axios');
axios_debug_log({
  request: function (log, config) {
    if (config.url) {
      const url = new URL(config.url, config.baseURL);
      log('%s -> %s', config.method, url);
      // log('%O -> %O', config, url);
    }
  },
  response: function (log, response) {
    log('res <- %s with %o', response.config.url, response.headers);
  },
  error: function (log, error) {
    log('Axios error %O', error);
  },
});

export const axios_krb_waiverdb = axios.create({
  baseURL: cfg.waiverdb.url,
  withCredentials: true,
});

const addKrbAuth = (axiosinst: AxiosInstance) => {
  axiosinst.interceptors.request.use(
    async (config) => {
      if (!config.url) {
        throw new Error('Missing url in axios config.');
      }
      const url = new URL(config.url, config.baseURL);
      const serviceName = `HTTP@${url.hostname}`;
      let client;
      let token;
      try {
        client = await kerberos.initializeClient(serviceName);
        token = await client.step('');
      } catch (error) {
        log('Keberos auth failed with: %O', error);
        throw new axios.Cancel('Request was canceled. Kerberos auth failed.');
      }
      log('Add krb auth for request to: %s, %s', serviceName, config.url);
      const authHeader = `Negotiate ${token}`;
      config.headers['Authorization'] = authHeader;
      return config;
    },
    (error) => {
      return Promise.reject(error);
    },
  );
};

require('axios-debug-log').addLogger(axios, log);
require('axios-debug-log').addLogger(axios_krb_waiverdb, log);
log('Adding Kerberos auth to axios_krb_waiverdb');
addKrbAuth(axios_krb_waiverdb);
