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

import _ from 'lodash';

export const printify = (obj: any): string => {
  var cache: any[] = [];
  function circular_ok(_key: string, value: any) {
    if (typeof value === 'object' && value !== null) {
      if (cache.indexOf(value) !== -1) {
        return;
      }
      cache.push(value);
    }
    return value;
  }
  /** JSON.stringify does not preserve any of the not-owned properties and not-enumerable properties of the object */
  return JSON.stringify(
    _.defaultsDeep(
      undefined,
      _.toPlainObject(obj),
      _.pick(obj, Object.getOwnPropertyNames(obj)),
    ),
    circular_ok,
    2,
  );
};

export default printify;

/**
 * to preserve any properties not owned by the object
    _.defaultsDeep(
      _.toPlainObject(_.pick(obj, Object.getOwnPropertyNames(obj))),
      obj,
    ),
 */