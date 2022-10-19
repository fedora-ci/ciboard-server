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
import * as graphql from 'graphql';
import moment from 'moment';

const debug = require('debug');
const log = debug('osci:distgit_types');
const { GraphQLList, GraphQLString, GraphQLObjectType } = graphql;

/**
 * Returns an arrays of lines, that begins with 'start_word'
 */
const linesWith = (lines: string, start_word: string) =>
  _.filter(
    _.split(lines, '\n'),
    _.flow(_.identity, _.partial(_.startsWith, _, start_word)),
  );

/**
 * Returns a word from right by 'index'
 */
const getRightWord = (line: string, index: number) => {
  const words = _.split(line, ' ');
  return _.get(words, _.size(words) - index - 1);
};

export type CommitObjectType = {
  commit_message: string;
  tree?: string;
  parents: string[];
  author_date_timezone: string;
  committer_date_timezone: string;
  author_date_seconds: string;
  committer_date_seconds: string;
  author_email: string;
  committer_email: string;
  author_name: string;
  committer_name: string;
};

/**
 * GitLab API commit reply:
 *
 * {
 *   "id": "6faa892b04c6704c0a9db9521c5e1e38b6e1e2b2",
 *   "short_id": "6faa892b",
 *   "created_at": "2021-08-09T19:28:18.000+00:00",
 *   "parent_ids": [
 *     "66f2dd6994df776bde92d9da04e86404ba054bb7"
 *   ],
 *   "title": "Rebuilt for IMA sigs, glibc 2.34, aarch64 flags",
 *   "message": "Rebuilt for IMA sigs, glibc 2.34, aarch64 flags\n\nRelated: rhbz#1991688\nSigned-off-by: Mohan Boddu <...>\n",
 *   "author_name": "Mohan Boddu",
 *   "author_email": "...",
 *   "authored_date": "2021-08-09T19:28:18.000+00:00",
 *   "committer_name": "Mohan Boddu",
 *   "committer_email": "...",
 *   "committed_date": "2021-08-09T19:28:18.000+00:00",
 *   "trailers": {},
 *   "web_url": "https://gitlab.com/redhat/centos-stream/rpms/bash/-/commit/6faa892b04c6704c0a9db9521c5e1e38b6e1e2b2",
 *   "stats": {
 *     "additions": 5,
 *     "deletions": 1,
 *     "total": 6
 *   },
 *   "status": null,
 *   "project_id": 23656762,
 *   "last_pipeline": null
 * }
 */

export type GitLabApiCommitType = {
  id: string;
  short_id: string;
  created_at: string;
  parent_ids: string[];
  title: string;
  message: string;
  author_name: string;
  author_email: string;
  authored_date: string;
  committer_name: string;
  committer_email: string;
  committed_date: string;
  trailers: {};
  web_url: string;
  stats: {
    additions: number;
    deletions: number;
    total: number;
  };
  status: null;
  project_id: number;
  last_pipeline: null;
};

/**
 * {
 *   "author": "Fedora Release Engineering",
 *   "commit_time": 1626891952,
 *   "commit_time_offset": 0,
 *   "committer": "Fedora Release Engineering",
 *   "hash": "bb2680b06dabcb8bb1f5b85a78ab6b0b851f9bf9",
 *   "message": "- Rebuilt for https://fedoraproject.org/wiki/Fedora_35_Mass_Rebuild\n\nSigned-off-by: Fedora Release Engineering <releng@fedoraproject.org>\n",
 *   "parent_ids": [
 *     "81e29595d210a5954deaf8de520b04c543c36a8a"
 *   ],
 *   "tree_id": "4d8f7ce9f3533642636edd46089e6f14366e2eca"
 * }
 */

export type PagureApiCommitType = {
  author: string;
  commit_time: number;
  commit_time_offset: number;
  committer: string;
  hash: string;
  message: string;
  parent_ids: string[];
  tree_id: string;
};

export const commitObjFromPagureApi = (
  commitApi: PagureApiCommitType,
): CommitObjectType => {
  const co: CommitObjectType = {
    commit_message: commitApi.message,
    parents: commitApi.parent_ids,
    author_date_timezone: moment()
      .utcOffset(commitApi.commit_time_offset)
      .format('ZZ'),
    committer_date_timezone: moment()
      .utcOffset(commitApi.commit_time_offset)
      .format('ZZ'),
    author_date_seconds: commitApi.commit_time.toString(),
    committer_date_seconds: commitApi.commit_time.toString(),
    author_email: '',
    committer_email: '',
    author_name: commitApi.author,
    committer_name: commitApi.author,
  };

  return co;
};

/**
 * <time zone offset> is a positive or negative offset from UTC. For example CET (which is 1 hour ahead of UTC) is +0100
 * https://datatracker.ietf.org/doc/html/rfc2822
 * +hhmm means +(hh * 60 + mm) minutes, and -hhmm means -(hh * 60 + mm) minutes)
 */

export const commitObjFromGitLabApi = (
  commitApi: GitLabApiCommitType,
): CommitObjectType => {
  const co: CommitObjectType = {
    commit_message: commitApi.message,
    parents: commitApi.parent_ids,
    author_date_timezone: moment()
      .utcOffset(commitApi.authored_date)
      .format('ZZ'),
    committer_date_timezone: moment()
      .utcOffset(commitApi.committed_date)
      .format('ZZ'),
    author_date_seconds: Date.parse(commitApi.authored_date).toString(),
    committer_date_seconds: Date.parse(commitApi.committed_date).toString(),
    author_email: commitApi.author_email,
    committer_email: commitApi.committer_email,
    author_name: commitApi.author_name,
    committer_name: commitApi.committer_name,
  };

  return co;
};

/**
 * https://stackoverflow.com/questions/22968856/what-is-the-file-format-of-a-git-commit-object-data-structure
 */
export const commitObjFromRaw = (raw: Buffer) => {
  /**
   * Commit-object raw format: commit {size}\0{content}
   */
  const content_start =
    _.findIndex(raw, _.flow(_.identity, _.partial(_.eq, 0))) + 1;
  const content_bin = raw.slice(content_start);
  const content = content_bin.toString();
  /**
   * Commit object content == headers + commit message
   */
  const message_start = content.indexOf('\n\n');
  const message = content.slice(message_start + 1);
  const headers = content.slice(0, message_start);
  const line_tree = linesWith(headers, 'tree')[0];
  const lines_parents = linesWith(headers, 'parent');
  const line_author = linesWith(headers, 'author')[0];
  const line_committer = linesWith(headers, 'committer')[0];
  var co: CommitObjectType = {
    commit_message: message,
    tree: _.split(line_tree, ' ')[1],
    parents: _.map(lines_parents, (line) => _.split(line, ' ')[1]),
    author_date_timezone: getRightWord(line_author, 0),
    committer_date_timezone: getRightWord(line_committer, 0),
    author_date_seconds: getRightWord(line_author, 1),
    committer_date_seconds: getRightWord(line_committer, 1),
    author_email: line_author.match(/<(.*)>/)?.[1] || '',
    committer_email: line_committer.match(/<(.*)>/)?.[1] || '',
    author_name: line_author.match(/ (.*) </)?.[1] || '',
    committer_name: line_committer.match(/ (.*) </)?.[1] || '',
  };
  return co;
};

/**
 * https://git-scm.com/book/en/v2/Git-Internals-Transfer-Protocols
 *
 * tree cfda3bf379e4f8dba8717dee55aab78aef7f4daf
 * parent 085bb3bcb608e1e8451d4b2432f8ecbe6306e7e7
 * author Scott Chacon <schacon@gmail.com> 1205815931 -0700
 * committer Scott Chacon <schacon@gmail.com> 1240030591 -0700
 *
 * Change version number
 *
 * tree {tree_sha}
 * {parents}
 * author {author_name} <{author_email}> {author_date_seconds} {author_date_timezone}
 * committer {committer_name} <{committer_email}> {committer_date_seconds} {committer_date_timezone}
 *
 * {commit message}
 *
 */
export const CommitObject = new GraphQLObjectType({
  name: 'CommitObject',
  fields: () => ({
    tree: {
      type: GraphQLString,
      description: 'SHA of the tree object this commit points to',
    },
    parents: {
      type: new GraphQLList(GraphQLString),
      description: 'Can be no parents, 2 and more',
    },
    author_name: { type: GraphQLString },
    author_email: { type: GraphQLString },
    author_date_seconds: {
      type: GraphQLString,
      description: 'seconds since 1970',
    },
    author_date_timezone: {
      type: GraphQLString,
      description: 'UTC',
    },
    committer_name: { type: GraphQLString },
    committer_email: { type: GraphQLString },
    committer_date_seconds: {
      type: GraphQLString,
      description: 'seconds since 1970',
    },
    committer_date_timezone: {
      type: GraphQLString,
      description: 'UTC',
    },
    commit_message: { type: GraphQLString },
  }),
});

export const DistGitInstanceInputType = new graphql.GraphQLEnumType({
  name: 'DistGitInstanceInputType',
  values: {
    rh: { value: 'rh' },
    fp: { value: 'fp' },
    cs: { value: 'cs' },
  },
});
