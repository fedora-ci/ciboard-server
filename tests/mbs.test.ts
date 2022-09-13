/*
 * This file is part of ciboard
 *
 * Copyright (c) 2021 Matěj Grabovský <mgrabovs@redhat.com>
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

import { ZodError } from 'zod';

import { ModuleBuild, moduleBuildSchema } from '../src/services/mbs';

import mbsResponse from './mbs_response.json';

const moduleBuildObject: ModuleBuild = {
  context: '522a0ee4',
  id: 15406,
  koji_tag: 'module-postgresql-12-8040020220525214753-522a0ee4',
  name: 'postgresql',
  owner: 'fjanus',
  scmurl:
    'git://pkgs.devel.redhat.com/modules/postgresql?#8585f9385dbe1aee5ab1c07ebf55e4b83c1adb84',
  scratch: false,
  state_name: 'ready',
  stream: '12',
  tasks: [
    {
      component: 'module-build-macros',
      id: 45556389,
      nvr: 'module-build-macros-0.1-1.module+el8.4.0+15406+aeb4ae67',
      state: 1,
    },
    {
      component: 'pgaudit',
      id: 37233956,
      nvr: 'pgaudit-1.4.0-6.module+el8.4.0+11288+c193d6d7',
      state: 1,
    },
    {
      component: 'postgres-decoderbufs',
      id: 37233955,
      nvr: 'postgres-decoderbufs-0.10.0-2.module+el8.4.0+11288+c193d6d7',
      state: 1,
    },
    {
      component: 'postgresql',
      id: 45556697,
      nvr: 'postgresql-12.11-2.module+el8.4.0+15406+aeb4ae67',
      state: 1,
    },
  ],
  time_completed: '2022-05-25T22:17:59Z',
  version: '8040020220525214753',
};

test('valid response is parsed successfully', () => {
  const parsed = moduleBuildSchema.parse(mbsResponse);
  expect(parsed).toEqual(moduleBuildObject);
});

test('empty response throws an error', () => {
  expect(() => {
    const fakeResponse = {};
    moduleBuildSchema.parse(fakeResponse);
  }).toThrow(ZodError);
});

test('incomplete response throws an error', () => {
  expect(() => {
    const fakeResponse = {
      context: '522a0ee4',
      id: 15406,
      owner: 'fjanus',
      scratch: false,
      stream: '12',
      version: '8040020220525214753',
    };
    moduleBuildSchema.parse(fakeResponse);
  }).toThrow(ZodError);
});
