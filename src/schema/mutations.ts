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

import util from 'util';
import debug from 'debug';
import * as graphql from 'graphql';
import { waiverdb_cfg } from '../cfg';
import { WaiverDBWaiverType } from './waiverdb_types';
import { axios_krb_waiverdb } from '../services/axios';
import _ from 'lodash';
import axios from 'axios';

const log = debug('osci:mutations');

const { GraphQLString, GraphQLBoolean, GraphQLNonNull, GraphQLObjectType } =
  graphql;

const mutation = new GraphQLObjectType({
  name: 'Mutation',
  fields: {
    waiver_db_new: {
      type: WaiverDBWaiverType,
      args: {
        waived: { type: new GraphQLNonNull(GraphQLBoolean) },
        comment: { type: new GraphQLNonNull(GraphQLString) },
        testcase: { type: new GraphQLNonNull(GraphQLString) },
        subject_type: {
          type: new GraphQLNonNull(GraphQLString),
        },
        product_version: {
          type: new GraphQLNonNull(GraphQLString),
        },
        subject_identifier: {
          type: new GraphQLNonNull(GraphQLString),
        },
      },
      async resolve(parentValue, payload, request) {
        let response;
        const { user } = request;
        if (!user || !user.displayName) {
          const comment = util.format(
            'User is not logged, when sending a waiver for: %s.',
            payload.subject_identifier
          );
          log(comment);
          return new Error(comment);
        }
        try {
          const comment = util.format(
            '%s: %s',
            user.displayName,
            payload.comment
          );
          /**
           * https://docs.pagure.org/waiverdb/admin-guide.html#waive-permission
           * Kerberos dashboard user is superuser:
           * https://gitlab.../ansible-playbooks/waiverdb-playbooks/-/merge_requests/54
           */
          const username = user.nameID.split('@')[0];
          log('Send waiver for user: %s', username);
          response = axios_krb_waiverdb({
            method: 'post',
            url: waiverdb_cfg?.waivers.api_url.pathname,
            data: { ...payload, comment, username },
          });
        } catch (error) {
          return error;
        }
        /**
         * .then() - only on success. On errors will be returned complete response object with {errors, data}
         */
        return response.then(
          (x) => x.data,
          (x) => {
            if (axios.isAxiosError(x) && x.response?.data.message) {
              x.message = `${x.message} (${x.response.data.message})`;
            }
            return x;
          }
        );
      },
    },
  },
});

export default mutation;
