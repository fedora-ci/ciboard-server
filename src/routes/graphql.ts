/*
 * This file is part of ciboard-server
 *
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

import { Express } from 'express';
import { graphqlHTTP } from 'express-graphql';
import * as graphql from 'graphql';

import { logger } from '../logger';
import schema from '../schema/schema';

export default (app: Express) => {
  app.use(
    '/graphql',
    graphqlHTTP({
      customFormatErrorFn(error) {
        // Report the error to console as a warning.
        const errorString = graphql.printError(error);
        logger.warn(`GraphQL error: ${errorString}`);

        // Pass through the error object itself unchanged.
        return error;
      },
      /**
       * graphiql -- only available in delevelopment environment
       * Allows run queries agains development server
       */
      graphiql: true,
      schema,
    }),
  );
};
