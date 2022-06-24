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
import debug from 'debug';

const log = debug('osci:misc');

/**
 * How Yum and RPM Compare Versions
 * https://blog.jasonantman.com/2014/07/how-yum-and-rpm-compare-versions/
 */

export const getReleaseFromNvr = (nvr: string): string => {
  /**
   * Input: foo-1.0-1.el9 or virt-8.3-8030020200812155519.30b713e6
   * Release: 1.el9 or 8030020200812155519.30b713e6
   * Do steps:
   * 1. cut from left to the latest `-`
   * https://blog.jasonantman.com/2014/07/how-yum-and-rpm-compare-versions/
   */
  const cut_from_left = _.lastIndexOf(nvr, '-') + 1;
  return nvr.substring(cut_from_left);
};

export const getOSVersionFromTag = (
  tag: string | undefined,
): string | undefined => {
  if (_.isNil(tag)) {
    return undefined;
  }
  /*
   * Possible tags:
   * /^(supp-)?rhel-[89]\.\d+\.\d+(-alpha)?(-beta)?(-z)?(-llvm-toolset|-go-toolset|-rust-toolset|.+-stack)?-gate$/
   * /^(advanced-virt-[\w\.]+-)?(rhel-[89]\.\d+\.\d+(-alpha)?(-beta)?(-z)?-modules-gate)$/
   */
  const match = tag.match(/rhel-(\d+)\./i);
  if (match == null) {
    return undefined;
  }
  return match[1];
};

export const getOSVersionFromNvr = (
  nvr: string,
  artifactType: string,
): string | undefined => {
  /**
   * This is not realiable.
   * From discussion with dcantrell@: no strict mapping between koji-tag/target <-> dist-tag
   * Return first number from release
   * Knowns releases:
   * Look for 'el', 'fc' prefix:
   * rust-yaml-rust-0.4.4-2.el9 -> Release: 2.el9 -> RHEL: 9
   * Modules: first number from release:
   * libreoffice-flatpak-8030020201013063128.306be773 -> Release: 8030020201013063128.306be773 -> RHEL: 8
   * flatpak-runtime-f33-3320201014073228.eb6bdfed -> Release: 3320201014073228.eb6bdfed -> 33
   * kmod-redhat-mlx5_core-5.0_0_dup8.2-1.el8_2 -> Release: 1.el8_2
   * Release can have many dots.
   */
  const release = getReleaseFromNvr(nvr);
  var os_version;
  if (artifactType === 'redhat-module') {
    if (/-f\d\d-/.test(nvr)) {
      /**
       * Fedora module - take 2 digits.
       */
      os_version = release.substring(0, 2);
    } else {
      /**
       * RHEL based.
       * Take 1 digit.
       */
      os_version = release.substring(0, 1);
    }
  } else {
    /**
     * Release : 1.fc32_2
     * We discussed with dcantrell@ : and for now solution is to search for pattern: \.(el|fc)[0-9]+
     */
    var dist_tag = release.match(/\.(el|fc)[0-9]+/g)?.toString();
    os_version = dist_tag?.replace(/\.(el|fc)/, '');
  }
  log('nvr: %s, has os version: %s', nvr, os_version);
  return os_version;
};
