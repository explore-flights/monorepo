import { Container, ContentLayout, Header, Link, TextContent } from '@cloudscape-design/components';
import React from 'react';

export function Links() {
  return (
    <ContentLayout header={<Header variant={'h1'}>Links</Header>}>
      <Container>
        <TextContent>
          <ul>
            <li>
              <Link
                external={true}
                href={'https://www.miles-and-more.com/de/en/program/status-benefits/new-statusprogramme/status-achievement.html'}
              >M&M Simple Status Calculator</Link>
            </li>
            <li>
              <Link
                external={true}
                href={'https://www.miles-and-more.com/de/en/program/status-benefits/status-level-comparison.html'}
              >M&M Status Comparison</Link>
            </li>
            <li>
              <Link
                external={true}
                href={'https://www.miles-and-more.com/de/en/program/status-benefits/frequent-traveller-status.html'}
              >M&M Frequent Traveller Benefits</Link>
            </li>
            <li>
              <Link
                external={true}
                href={'https://www.miles-and-more.com/de/en/program/status-benefits/senator-status.html'}
              >M&M Senator Benefits</Link>
            </li>
            <li>
              <Link
                external={true}
                href={'https://www.miles-and-more.com/de/en/program/status-benefits/hon-circle-status.html'}
              >M&M HON Circle Benefits</Link>
            </li>
            <li>
              <Link
                external={true}
                href={'https://www.expertflyer.com/'}
              >expertflyer.com - Flight/Seat Availability</Link>
            </li>
            <li>
              <Link
                external={true}
                href={'https://seats.aero/'}
              >seats.aero - Search Award Availability</Link>
            </li>
          </ul>
        </TextContent>
      </Container>
    </ContentLayout>
  );
}
