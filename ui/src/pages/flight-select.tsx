import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Container, ContentLayout, Header, TextContent } from '@cloudscape-design/components';
import { FlightLink } from '../components/common/flight-link';

export function FlightSelect() {
  const [searchParams] = useSearchParams();
  const flightNumbers = searchParams.getAll('v');

  return (
    <ContentLayout header={<Header variant={'h1'}>Flight Selection</Header>}>
      <Container>
        <TextContent>
          <ul>
            {...flightNumbers.map((v) => <FlightLinkListItem flightNumber={v} />)}
          </ul>
        </TextContent>
      </Container>
    </ContentLayout>
  )
}

function FlightLinkListItem({ flightNumber }: { flightNumber: string }) {
  return (
    <li>
      <FlightLink flightNumber={flightNumber} />
    </li>
  )
}