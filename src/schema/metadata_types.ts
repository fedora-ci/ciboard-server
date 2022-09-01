/*
 * This file is part of ciboard-server

 * Copyright (c) 2022 Andrei Stepanov <astepano@redhat.com>
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

import * as graphql from 'graphql';
import debug from 'debug';
import { GraphQLJSON } from 'graphql-type-json';
import _ from 'lodash';
import { GraphQLID } from 'graphql';

const log = debug('osci:metadata_types');

const {
  GraphQLObjectType,
  GraphQLList,
  GraphQLString,
  GraphQLBoolean,
  GraphQLInt,
} = graphql;

export const MetadataModHistory = new GraphQLObjectType({
  name: 'CISystemModHistory',
  fields: () => ({
    author: {
      type: GraphQLString,
      description: 'A user who made modification.',
    },
    time: {
      type: GraphQLString,
      description: 'Date encoded in ISO 8601 format.',
    },
  }),
});

export const MetadataRawType = new GraphQLObjectType({
  name: 'MetadataRawType',
  fields: () => ({
    _id: { type: GraphQLID, description: 'internal ID for CI-system ' },
    testcase_name: { type: GraphQLString, description: 'CI-system name' },
    testcase_name_is_regex: {
      type: graphql.GraphQLBoolean,
      description: 'testcase_name is encoded in regex JS regex',
    },
    priority: {
      type: GraphQLInt,
      description: 'Priority of this metadata.',
    },
    product_version: {
      type: GraphQLString,
      description: 'If present, metadata applies to specific product.',
    },
    payload: { type: GraphQLJSON, description: 'Payload according to schema.' },
    _update_history: { type: new GraphQLList(MetadataModHistory) },
    _updated: {
      type: GraphQLString,
      description: 'When the document was updated.',
    },
    _version: {
      type: GraphQLInt,
      description: 'The document version.',
    },
  }),
});

export const MetadataConsolidatedType = new GraphQLObjectType({
  name: 'MetadataConsolidatedType',
  fields: () => ({
    payload: { type: GraphQLJSON, description: 'Consolidated payload' },
  }),
});

export const AuthZMappingType = new GraphQLObjectType({
  name: 'AuthZMappingType',
  fields: () => ({
    can_edit_metadata: {
      type: GraphQLBoolean,
      description: 'If logged in user can edit metadata',
    },
  }),
});
