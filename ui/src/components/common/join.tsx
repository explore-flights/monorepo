import React from 'react';

export function Join({ seperator, items }: { seperator: () => React.ReactNode, items: Iterable<React.ReactNode> }) {
  const result: Array<React.ReactNode> = [];
  for (const item of items) {
    result.push(item);
    result.push(seperator());
  }

  if (result.length > 0) {
    result.pop();
  }

  return (
    <>{...result}</>
  );
}

export function BulletSeperator() {
  return <>&nbsp;&#8226;&nbsp;</>;
}
