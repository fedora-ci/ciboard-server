/*
 * This file is part of ciboard-server

 * Copyright (c) 2021, 2022, 2023 Andrei Stepanov <astepano@redhat.com>
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
import debug from 'debug';
import * as graphql from 'graphql';
const { GraphQLObjectType } = graphql;

import { waiverNew } from './waiverdb';
import { metadataUpdate } from './metadata';

const log = debug('osci:mutations');

const mutation = new GraphQLObjectType({
  name: 'Mutation',

  fields: () =>
    _.assign<
      graphql.GraphQLFieldConfigMap<any, any>,
      graphql.GraphQLFieldConfigMap<any, any>
    >({}, { waiverNew: waiverNew, metadataUpdate: metadataUpdate }),
});

export default mutation;
