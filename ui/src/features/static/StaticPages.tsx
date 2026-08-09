import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowLeft, Code2 as Github, Mail, Plane } from 'lucide-react';
import { api } from '@/api/client';
import { Button, Card, PageHeader } from '@/components/primitives';

export function AboutPage() {
  const airlines = useQuery({ queryKey: ['airlines'], queryFn: api.airlines }).data ?? [];
  const integrated = ['LH', 'LX', 'WK', 'OS', 'SN', '4Y', 'EN'];
  return (
    <div className='page prose-page'>
      <PageHeader
        eyebrow='About'
        title='About explore.flights'
        description='Why this project exists, how it operates, and what its data can—and cannot—show.'
      />
      <ProseSection title='Motivation'>
        <p>
          This website began as a personal project, born out of curiosity, passion, and a bit of
          necessity.
        </p>
        <p>
          With many traditional airlines, it is possible to book almost any combination of their
          scheduled flights by calling the airline hotline—provided the itinerary still meets the
          airline’s fare rules, such as the required minimum connection time at each airport.
        </p>
        <p>
          Most booking websites display only a limited set of options and can overlook interesting
          or valid connections. As an aviation enthusiast, I am not always looking for the cheapest
          way from A to B; sometimes I want a specific aircraft or a longer layover at an airport I
          enjoy exploring.
        </p>
        <p>
          That is why I started this website. It initially offered only the connection search tool,
          which is now available in the <Link to='/connections'>connection finder</Link>.
        </p>
      </ProseSection>
      <ProseSection title='How this site is operated'>
        <p>With the exception of DNS, the entire infrastructure behind this website runs on AWS.</p>
        <p>
          This is a hobby project rather than a commercial venture, so operating costs are kept low
          through the AWS free tier and CloudFront caching. Roughly 80% of requests can be served
          directly from CloudFront caches. The largest cost driver is the continuous background
          process that updates the schedule data.
        </p>
        <p>The key services are:</p>
        <ul>
          <li>AWS Lambda, S3 and CloudFront for serving the website.</li>
          <li>AWS Step Functions, Lambda and ECS Fargate for background data updates.</li>
        </ul>
        <p>
          The source code is openly available on{' '}
          <a href='https://github.com/explore-flights' target='_blank' rel='noreferrer'>
            GitHub
          </a>
          . Overall, the monetary cost is approximately 8 USD per month, plus about 45 EUR per year
          for the domain.
        </p>
      </ProseSection>
      <ProseSection title='Data and Limitations'>
        <p>
          The biggest limitation is the scope of flight data available to the project. The core is
          powered by Lufthansa’s{' '}
          <a href='https://developer.lufthansa.com/' target='_blank' rel='noreferrer'>
            public API
          </a>
          , covering the fully integrated Lufthansa Group airlines:
        </p>
        <ul>
          <li>Lufthansa (LH)</li>
          <li>SWISS (LX)</li>
          <li>Edelweiss (WK)</li>
          <li>Austrian (OS)</li>
          <li>Brussels Airlines (SN)</li>
          <li>Discover Airlines (4Y)</li>
          <li>Air Dolomiti (EN)</li>
        </ul>
        <p>
          Codeshares allow the project to extrapolate partial coverage for {airlines.length || 48}{' '}
          airlines.{' '}
          {airlines.length > 0 && (
            <>
              Currently represented partners include{' '}
              {[...airlines]
                .filter((airline) => !integrated.includes(airline.iataCode))
                .sort((a, b) => a.iataCode.localeCompare(b.iataCode))
                .slice(0, 24)
                .map((airline) => `${airline.name} (${airline.iataCode})`)
                .join(', ')}
              .
            </>
          )}
        </p>
        <p>
          Flight data is refreshed once per day, covering two days in the past through approximately
          360 days into the future.
        </p>
      </ProseSection>
      <ProseSection title='Report Issues or Feature Requests'>
        <p>
          If you find incorrect data, have an idea, or want to share feedback, send an email to{' '}
          <a href='mailto:contact@explore.flights'>contact@explore.flights</a> or{' '}
          <a
            href='https://github.com/explore-flights/monorepo/issues/new/choose'
            target='_blank'
            rel='noreferrer'
          >
            open an issue on GitHub
          </a>
          .
        </p>
        <div className='inline-actions'>
          <a
            className='button button-secondary'
            href='https://github.com/explore-flights'
            target='_blank'
            rel='noreferrer'
          >
            <Github size={17} />
            Source code
          </a>
          <a className='button button-secondary' href='mailto:contact@explore.flights'>
            <Mail size={17} />
            Contact
          </a>
        </div>
      </ProseSection>
    </div>
  );
}

export function LegalPage() {
  return (
    <div className='page prose-page'>
      <PageHeader eyebrow='Legal' title='Legal' description='Last updated: 4 May 2024' />
      <ProseSection title='Contact'>
        <p>
          Send us an email at <a href='mailto:contact@explore.flights'>contact@explore.flights</a>.
        </p>
      </ProseSection>
      <ProseSection title='Liability for content'>
        <p>
          We make every effort to keep the information on our site current, but accept no liability
          whatsoever for the content provided. Pursuant to §7 par. 1 of TMG (German Tele-Media Act),
          the law limits our responsibility as a service provider to our own content on these web
          pages. According to §8 to §10 of TMG, we are not obligated to monitor third-party
          information provided or stored on our website or to investigate circumstances that
          indicate illegal activity.
        </p>
        <p>
          Obligations to remove or block the use of information under general law remain unaffected.
          Liability is only possible from the moment of knowledge of a specific infringement. Upon
          notification of appropriate violations, we will remove this content immediately.
        </p>
      </ProseSection>
      <ProseSection title='Copyright'>
        <p>
          The content and works provided on these webpages are governed by the copyright laws of
          Germany. Duplication, processing, distribution, or any form of commercialisation beyond
          the scope of copyright law requires the prior written consent of its respective author or
          creator.
        </p>
      </ProseSection>
    </div>
  );
}

export function PrivacyPolicyPage() {
  return (
    <div className='page prose-page'>
      <PageHeader
        eyebrow='Privacy'
        title='Privacy Policy'
        description='Last updated: 11 Aug 2026'
      />
      <ProseSection title='Human version'>
        <ul>
          <li>
            We use cookies and browser local storage to remember privacy and interface preferences.
          </li>
          <li>
            We do not know your password and only receive account details you voluntarily provide
            through a login provider.
          </li>
          <li>
            Server log files are retained for 14 days. They may contain personal information, but
            that information is neither shared nor used by us.
          </li>
        </ul>
      </ProseSection>
      <ProseSection title='Personal Identifiable Information'>
        <p>
          We may collect personal identification information in connection with activities,
          services, features, or resources available on the site. Users may visit anonymously. We
          collect personal identification information only when users voluntarily submit it, and
          users may refuse to supply it, although this may prevent access to some account-related
          activities.
        </p>
      </ProseSection>
      <ProseSection title='Non-personal Identifiable Information'>
        <p>
          We may collect non-personal information when users interact with the site, including
          browser name, computer type, operating system, internet provider, and similar technical
          information.
        </p>
      </ProseSection>
      <ProseSection title='Cookies & Local storage'>
        <p>
          The site uses cookies and local storage for security, record keeping, and preferences.
          Browsers can refuse or warn about storage, but some functionality may then be unavailable.
        </p>
        <div className='storage-grid'>
          <Storage name='SESSION' type='Strictly necessary' expiration='24 hours'>
            Keeps an authenticated session available across requests.
          </Storage>
          <Storage name='XSRF-TOKEN' type='Strictly necessary' expiration='Session'>
            Protects mutating requests from cross-site request forgery.
          </Storage>
          <Storage name='FLIGHTS:CONSENT' type='Strictly necessary'>
            Remembers the privacy decision on this device.
          </Storage>
          <Storage name='FLIGHTS:PREFERENCES' type='Functional'>
            Remembers interface preferences such as color scheme and density.
          </Storage>
          <Storage name='FLIGHTS:NOTIFICATION_READ_MARKER' type='Functional'>
            Remembers the newest notification marked as read on this device.
          </Storage>
        </div>
      </ProseSection>
      <ProseSection title='How we use collected information'>
        <ul>
          <li>
            <strong>Operate the site:</strong> information may be needed to display content
            correctly.
          </li>
          <li>
            <strong>Improve customer service:</strong> supplied information helps us answer support
            requests.
          </li>
          <li>
            <strong>Personalize the experience:</strong> aggregate information may help us
            understand how resources are used.
          </li>
          <li>
            <strong>Improve the site:</strong> feedback may be used to improve features and
            services.
          </li>
        </ul>
      </ProseSection>
      <ProseSection title='How we protect your information'>
        <p>
          We use appropriate collection, storage, processing, and security measures to protect
          against unauthorized access, alteration, disclosure, or destruction of personal
          information and data stored on the site.
        </p>
      </ProseSection>
      <ProseSection title='Sharing your personal information'>
        <p>We do not sell, trade, or rent personal identification information to others.</p>
      </ProseSection>
      <ProseSection title="Children's information">
        <p>
          We encourage parents and guardians to observe and guide online activity. explore.flights
          does not knowingly collect personal information from children under 13. Contact us if you
          believe a child supplied such information so it can be removed promptly.
        </p>
      </ProseSection>
      <ProseSection title='Third party websites'>
        <p>
          Links may lead to third-party sites whose content and practices we do not control.
          Browsing and interaction on another site are subject to that site’s own terms and
          policies.
        </p>
      </ProseSection>
      <ProseSection title='Login providers'>
        <p>
          Where account login is available, provider privacy policies apply:{' '}
          <a
            href='https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement'
            target='_blank'
            rel='noreferrer'
          >
            GitHub
          </a>
          ,{' '}
          <a href='https://policies.google.com/privacy?hl=en-US' target='_blank' rel='noreferrer'>
            Google
          </a>
          , and{' '}
          <a href='https://aws.amazon.com/privacy' target='_blank' rel='noreferrer'>
            AWS
          </a>{' '}
          for managed email/password authentication.
        </p>
      </ProseSection>
      <ProseSection title='Third-Party APIs'>
        <p>
          Interactive map tiles are provided by{' '}
          <a href='https://versatiles.org/' target='_blank' rel='noreferrer'>
            VersaTiles
          </a>
          . When enabled, the browser sends ordinary connection metadata such as IP address and user
          agent to that provider.
        </p>
      </ProseSection>
      <ProseSection title='Changes to this privacy policy'>
        <p>
          explore.flights may update this policy. Users should check it periodically to remain
          informed about how collected information is protected.
        </p>
      </ProseSection>
      <ProseSection title='Your acceptance of these terms'>
        <p>
          Using this site signifies acceptance of this policy. Continued use after changes
          constitutes acceptance of those changes.
        </p>
      </ProseSection>
      <ProseSection title='Contact'>
        <p>
          Questions about this policy or the site’s practices can be sent to{' '}
          <a href='mailto:contact@explore.flights'>contact@explore.flights</a>.
        </p>
      </ProseSection>
    </div>
  );
}

function ProseSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className='prose-card'>
      <h2>{title}</h2>
      {children}
    </Card>
  );
}
function Storage({
  name,
  type,
  expiration = 'Persistent',
  children,
}: {
  name: string;
  type: string;
  expiration?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <code>{name}</code>
      <dl>
        <div>
          <dt>Type</dt>
          <dd>{type}</dd>
        </div>
        <div>
          <dt>Expiration</dt>
          <dd>{expiration}</dd>
        </div>
      </dl>
      <p>{children}</p>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <main className='standalone-state'>
      <div className='logo-mark'>
        <Plane size={22} />
      </div>
      <span className='eyebrow'>404 / Off route</span>
      <h1>This page isn’t on the schedule.</h1>
      <p>The link may be old, or this route may no longer exist.</p>
      <Button onClick={() => history.back()} variant='secondary'>
        <ArrowLeft size={17} />
        Go back
      </Button>
      <Link className='button button-primary' to='/'>
        Return home
      </Link>
    </main>
  );
}
