import {
  Box, Container, ContentLayout, Header, Link, Popover, TextContent
} from '@cloudscape-design/components';
import React from 'react';
import { RouterLink } from '../components/common/router-link';
import { useAirlines } from '../components/util/state/data';
import { Email } from '../components/contact/contact';

export function About() {
  const airlines = useAirlines().data.airlines;

  return (
    <ContentLayout header={<Header variant={'h1'}>About</Header>}>
      <Container variant={'stacked'} header={<Header variant={'h2'}>Motivation</Header>}>
        <Box variant={'p'}>
          This website began as a personal project, born out of curiosity, passion, and a bit of necessity.
        </Box>
        <Box variant={'p'}>
          What many people don’t realize is that with many traditional airlines, it’s possible to book almost any
          combination of their scheduled flights by calling the airline hotline—provided the itinerary still meets the
          airline’s fare rules, such as the required <Popover content={'Minimum Connection Time'}>MCT</Popover> at the airports involved.
        </Box>
        <Box variant={'p'}>
          When I was looking for flights, I realized websites would often not show all possible combinations.
          As a little aviation nerd, I am not always looking for the cheapest option going from A to B, but also flying on particular aircraft or have a little more time on a layover at some airports.
        </Box>
        <Box variant={'p'}>
          When I was searching for flights myself, I noticed that most booking websites would only display a limited set of options,
          often overlooking interesting or valid connections.
          As an aviation enthusiast, I’m not always focused on finding the absolute cheapest way to get from A to B.
          Sometimes I’m more interested in flying on a specific aircraft type, or in having a longer layover at an airport I enjoy exploring.
        </Box>
        <Box variant={'p'}>
          That’s why I started this website.
          At first, it only offered the connection search tool, which you can still find on the <RouterLink to={'/'} target={'_blank'}>homepage</RouterLink> today.
        </Box>
      </Container>

      <Container variant={'stacked'} header={<Header variant={'h2'}>How this site is operated</Header>}>
        <Box variant={'p'}>
          With the exception of DNS, the entire infrastructure behind this website runs on AWS.
        </Box>
        <Box variant={'p'}>
          Since this is a hobby project and not a commercial venture, I try to keep operating costs as low as possible.
          To achieve that, I rely heavily on the AWS free tier and make use of CloudFront caching to reduce load on the backend.
          At the moment, roughly 80% of all requests are served directly from CloudFront caches, which helps keep things
          efficient and inexpensive.
          The biggest cost driver is the continuous background process of updating the data that powers the site.
        </Box>
        <Box variant={'p'}>
          The key AWS services in use are:
          <TextContent>
            <ul>
              <li>AWS Lambda, S3 and Cloudfront for serving website itself</li>
              <li>AWS StepFunctions, Lambda and ECS Fargate for background data updates</li>
            </ul>
          </TextContent>
          For those interested in the technical details, the entire source code is openly available on <Link href={'https://github.com/explore-flights'} external={true} target={'_blank'}>GitHub</Link>.
        </Box>
        <Box variant={'p'}>
          Overall, monetary costs of running this site are at ~8 USD per month (+ ~45 EUR per year for the domain).
        </Box>
      </Container>

      <Container variant={'stacked'} header={<Header variant={'h2'}>Data and Limitations</Header>}>
        <Box variant={'p'}>
          The biggest limitation of this project is the scope of the flight data I have access to.
        </Box>
        <Box variant={'p'}>
          The core of the site is powered by the <Link href={'https://developer.lufthansa.com/'} target={'_blank'} external={true}>public API</Link> provided by Lufthansa,
          which covers all fully integrated Lufthansa Group airlines:

          <TextContent>
            <ul>
              <li>Lufthansa (LH)</li>
              <li>Swiss (LX)</li>
              <li>Edelweiss (WK)</li>
              <li>Austrian (OS)</li>
              <li>Brussels (SN)</li>
              <li>Discover (4Y)</li>
              <li>Air Dolomiti (EN)</li>
            </ul>
          </TextContent>

          Using this data, I can also extrapolate flights that involve codeshares with partner carriers.
          This expands coverage to a total of {airlines.length > 0 ? airlines.length : 48} airlines that are at least partially tracked, including:

          <TextContent>
            <ul>
              {
                airlines
                  .filter((a) => !['LH', 'LX', 'WK', 'OS', 'SN', '4Y', 'EN'].includes(a.iataCode))
                  .toSorted((a, b) => a.iataCode.localeCompare(b.iataCode))
                  .map((a) => <li>{a.name} ({a.iataCode})</li>)
              }
            </ul>
          </TextContent>
        </Box>

        <Box variant={'p'}>
          Flight data is refreshed once per day, covering the entire range from two days in the past up to 360 days into the future.
        </Box>
      </Container>

      <Container variant={'stacked'} header={<Header variant={'h2'}>Report Issues or Feature Requests</Header>}>
        <Box variant={'p'}>
          If you come across incorrect data, have an idea for a new feature, or simply want to share general feedback,
          I’d love to hear from you. You can either:

          <TextContent>
            <ul>
              <li>Send me an E-Mail at <Email variant={'span'} /></li>
              <li>or <Link href={'https://github.com/explore-flights/monorepo/issues/new/choose'} target={'_blank'} external={true}>open an issue on GitHub</Link></li>
            </ul>
          </TextContent>
        </Box>
      </Container>
    </ContentLayout>
  );
}
