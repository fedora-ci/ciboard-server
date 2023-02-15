/*
 * This file is part of ciboard-server

 * Copyright (c) 2023 Andrei Stepanov <astepano@redhat.com>
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

import _ from 'lodash';
import * as graphql from 'graphql';
import debug from 'debug';
import BigInt from 'graphql-bigint';
import { GraphQLJSON } from 'graphql-type-json';

const log = debug('osci:eta_types');
const { GraphQLObjectType, GraphQLString } = graphql;

export const KaiErrataToolAutomationStateType = new GraphQLObjectType({
  name: 'KaiErrataToolAutomationStateType',
  fields: {
    msg_id: { type: GraphQLString },
    version: { type: GraphQLString },
    timestamp: {
      type: BigInt as graphql.GraphQLOutputType,
      description: 'JS timestamp in milliseconds',
    },
  },
});

export const ErrataToolAutomationStateType = new GraphQLObjectType({
  name: 'ErrataToolAutomationStateType',
  fields: {
    kai_state: { type: KaiErrataToolAutomationStateType },
    broker_msg_body: {
      type: GraphQLJSON,
      description: 'Complete message body, received from messages-broker',
    },
  },
});
