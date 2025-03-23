import { Box, Link } from '@cloudscape-design/components';
import React, { useMemo } from 'react';

// greatly simplified markdown, only supports links
export function Markdown({ md }: { md?: string }) {
  if (!md) {
    return undefined;
  }

  return useMemo(() => parse(md), [md]);
}

function parse(md: string): React.ReactNode {
  const elements: Array<React.ReactNode> = [];
  let buffer = '';

  let i = 0;
  while (i < md.length) {
    const char = md.charAt(i);
    if (char === '[') {
      if (buffer.length > 0) {
        elements.push(<Box>{buffer}</Box>);
        buffer = '';
      }

      let element: React.ReactNode;
      [element, i] = tryParseLink(md, i + 1);
      elements.push(element);
    } else {
      buffer += char;
      i++;
    }
  }

  if (buffer.length > 0) {
    elements.push(<Box>{buffer}</Box>);
  }

  return (
    <>
      {...elements}
    </>
  );
}

function tryParseLink(md: string, offset: number): [React.ReactNode, number] {
  let state = 0;
  let all = '[';
  let title = '';
  let href = '';

  let i = offset;
  while (i < md.length && state < 3) {
    const char = md.charAt(i);
    all += char;

    if (state === 0) {
      if (char === ']') {
        state = 1;
      } else {
        title += char;
      }
    } else if (state === 1) {
      if (char === '(') {
        state = 2;
      } else {
        state = 4;
      }
    } else if (state === 2) {
      if (char === ')') {
        state = 3;
      } else {
        href += char;
      }
    }

    i++;
  }

  if (state !== 3 || !URL.canParse(href, window.location.href)) {
    return [all, i];
  }

  const url = new URL(href, window.location.href);
  const external = url.host !== window.location.host;
  const prefix = external ? `${url.host}: ` : '';

  return [<Link external={external} href={url.href}>{prefix}{title}</Link>, i];
}