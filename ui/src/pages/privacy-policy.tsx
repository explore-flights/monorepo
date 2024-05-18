import {
  Box, ColumnLayout,
  Container, ContentLayout, ExpandableSection, Header, Link, TextContent,
} from '@cloudscape-design/components';
import React from 'react';
import { KeyValuePairs, ValueWithLabel } from '../components/common/key-value-pairs';
import { Contact } from '../components/contact/contact';

const LAST_UPDATED = new Date('2024-05-04');

export function PrivacyPolicy() {
  return (
    <ContentLayout header={<Header variant={'h1'} description={`Last updated: ${LAST_UPDATED.toLocaleDateString()}`}>Privacy Policy</Header>}>
      <Container variant={'stacked'} header={<Header variant={'h2'}>Human version</Header>}>
        <TextContent>
          <ul>
            <li>We use cookies and your browser's <Link href={'https://en.wikipedia.org/wiki/Web_storage'} external={true} fontSize={'inherit'}>local storage</Link> to keep you logged into your account</li>
            <li>We do not know your password and only your email address if you choose to login through "E-Mail & Password"</li>
            <li>We keep server log files for 14 days. Those may include personal information but this personal information will neither be shared nor be used by us</li>
          </ul>
        </TextContent>
      </Container>

      <Container variant={'stacked'} header={<Header variant={'h2'}>Personal Identifiable Information</Header>}>
        <Box variant={'p'}>
          We may collect personal identification information from users in a variety of ways in connection with activities, services, features or resources we make available on our site.
          Users may visit our site anonymously.
          We will collect personal identification information from users only if they voluntarily submit such information to us.
          Users can always refuse to supply personally identification information, except that it may prevent them from engaging in certain site related activities.
        </Box>
      </Container>

      <Container variant={'stacked'} header={<Header variant={'h2'}>Non-personal Identifiable Information</Header>}>
        <Box variant={'p'}>
          We may collect non-personal identification information about users whenever they interact with our site.
          Non-personal identification information may include the browser name, the type of computer and technical information about users means of connection to our site, such as the operating system and the Internet service providers utilized and other similar information.
        </Box>
      </Container>

      <Container variant={'stacked'} header={<Header variant={'h2'}>Cookies & Local storage</Header>}>
        <ColumnLayout columns={1}>
          <Box variant={'p'}>
            Our site may use "cookies" and "local storage" to enhance user experience.
            User's web browser places cookies on their hard drive for record-keeping purposes and sometimes to track information about them.
            Users may choose to set their web browser to refuse cookies, or to alert you when cookies are being sent.
            If they do so, note that some parts of the site may not function properly.
          </Box>

          <ExpandableSection headerText={'Cookies'}>
            <ColumnLayout columns={1}>
              <StorageDetail name={'SESSION'}>
                <CookieDetail type={'Strictly necessary'} expiration={'24h'} details={'Used to keep you signed in across requests.'} />
              </StorageDetail>

              <StorageDetail name={'XSRF-TOKEN'}>
                <CookieDetail type={'Strictly necessary'} expiration={'Session'} details={'The XSRF-Token cookie is used to offer a secure way to performing possibly mutating actions on the server. For example, if you want to create or delete something in your account, this Cookie is passed to the server to verify the action has been performed by you. This Cookie is valid only for one Session, that means your Browser automatically deletes it once your close it.'} />
              </StorageDetail>
            </ColumnLayout>
          </ExpandableSection>

          <ExpandableSection headerText={'Local storage'}>
            <ColumnLayout columns={1}>
              <StorageDetail name={'FLIGHTS:CONSENT'}>
                <LocalStorageDetail type={'Strictly necessary'} details={'Used to remember your decision of the Cookie-Consent dialog on this device.'} />
              </StorageDetail>

              <StorageDetail name={'FLIGHTS:PREFERENCES'}>
                <LocalStorageDetail type={'Functional'} details={'Used to remember your preferences on this device, such as your preferred color scheme and language.'} />
              </StorageDetail>
            </ColumnLayout>
          </ExpandableSection>
        </ColumnLayout>
      </Container>

      <Container variant={'stacked'} header={<Header variant={'h2'}>How we use collected information</Header>}>
        <Box variant={'p'}>explore.flights may collect and use personal information for the following purposes:</Box>
        <TextContent>
          <ul>
            <li>
              <Box variant={'strong'}>To run and operate our site</Box>
              <Box variant={'p'}>We may need your information to display content on the site correctly.</Box>
            </li>
            <li>
              <Box variant={'strong'}>To improve customer service</Box>
              <Box variant={'p'}>The information you provide helps us respond to your customer service requests and
                support needs more efficiently.</Box>
            </li>
            <li>
              <Box variant={'strong'}>To personalize user experience</Box>
              <Box variant={'p'}>We may use information in the aggregate to understand how our users as a group use the
                services and resources provided on our site.</Box>
            </li>
            <li>
              <Box variant={'strong'}>To improve our site</Box>
              <Box variant={'p'}>We may use feedback you provide to improve our products and services.</Box>
            </li>
          </ul>
        </TextContent>
      </Container>

      <Container variant={'stacked'} header={<Header variant={'h2'}>How we protect your information</Header>}>
        <Box variant={'p'}>
          We adopt appropriate data collection, storage and processing practices and security measures to protect against unauthorized access, alteration, disclosure or destruction of your personal information, username, and data stored on our site.
        </Box>
      </Container>

      <Container variant={'stacked'} header={<Header variant={'h2'}>Sharing your personal information</Header>}>
        <Box variant={'p'}>
          We do not sell, trade, or rent personal identification information to others.
        </Box>
      </Container>

      <Container variant={'stacked'} header={<Header variant={'h2'}>Children's information</Header>}>
        <Box variant={'p'}>
          We encourage parents and guardians to observe, participate in, and/or monitor and guide their online activity.
        </Box>
        <Box variant={'p'}>
          explore.flights does not knowingly collect any Personal Identifiable Information from children under the age of 13. If you think that your child provided this kind of information on our website, we strongly encourage you to contact us immediately and we will do our best efforts to promptly remove such information from our records.
        </Box>
      </Container>

      <Container variant={'stacked'} header={<Header variant={'h2'}>Third party websites</Header>}>
        <Box variant={'p'}>
          Users may find advertising or other content on our site that link to the sites and services of our partners, suppliers, advertisers, sponsors, licencors and other third parties.
          We do not control the content or links that appear on these Sites and are not responsible for the practices employed by websites linked to or from our site.
          In addition, these Sites or services, including their content and links, may constantly be changing.
          These sites and services may have their own privacy policies and customer service policies.
          Browsing and interaction on any other site, including sites which have a link to our site, is subject to that site's own terms and policies.
        </Box>
      </Container>

      <Container variant={'stacked'} header={<Header variant={'h2'}>Login providers</Header>}>
        <Box variant={'p'}>
          We use different login providers to offer our users a variety of options to create and login to their accounts. The privacy policies of our login providers can be viewed at:
        </Box>
        <KeyValuePairs columns={3}>
          <ValueWithLabel label={'GitHub'}>
            <Link href={'https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement'} external={true}>https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement</Link>
          </ValueWithLabel>

          <ValueWithLabel label={'Google'}>
            <Link href={'https://policies.google.com/privacy?hl=en-US'} external={true}>https://policies.google.com/privacy?hl=en-US</Link>
          </ValueWithLabel>

          <ValueWithLabel label={'E-Mail & Password'}>
            This login provider is managed by AWS (Amazon Web Services) solely for us. The privacy policy of AWS can be viewed at <Link href={'https://aws.amazon.com/privacy'} external={true}>https://aws.amazon.com/privacy</Link>
          </ValueWithLabel>
        </KeyValuePairs>
      </Container>

      <Container variant={'stacked'} header={<Header variant={'h2'}>Changes to this privacy policy</Header>}>
        <Box variant={'p'}>
          explore.flights has the discretion to update this privacy policy at any time.
          We encourage Users to frequently check this page for any changes to stay informed about how we are helping to protect the personal information we collect.
          You acknowledge and agree that it is your responsibility to review this privacy policy periodically and become aware of modifications.
        </Box>
      </Container>

      <Container variant={'stacked'} header={<Header variant={'h2'}>Your acceptance of this terms</Header>}>
        <Box variant={'p'}>
          By using this site, you signify your acceptance of this policy.
          If you do not agree to this policy, please do not use our site.
          Your continued use of the site following the posting of changes to this policy will be deemed your acceptance of those changes.
        </Box>
      </Container>

      <Container variant={'stacked'} header={<Header variant={'h2'}>Contact</Header>}>
        <Box variant={'p'}>
          If you have any questions about this Privacy Policy, the practices of this site, or your dealings with this Site, please contact us.
        </Box>
        <Contact />
      </Container>
    </ContentLayout>
  );
}

function StorageDetail({ name, children }: React.PropsWithChildren<{ name: React.ReactNode }>) {
  return (
    <>
      <Box variant={'h4'}>{name}</Box>
      {children}
    </>
  );
}

function CookieDetail({ type, expiration, details }: { type: string, expiration: string, details: string }) {
  return (
    <KeyValuePairs columns={3}>
      <ValueWithLabel label={'Type'}>{type}</ValueWithLabel>
      <ValueWithLabel label={'Expiration'}>{expiration}</ValueWithLabel>
      <ValueWithLabel label={'Details'}>{details}</ValueWithLabel>
    </KeyValuePairs>
  );
}

function LocalStorageDetail({ type, details }: { type: string, details: string }) {
  return (
    <KeyValuePairs columns={2}>
      <ValueWithLabel label={'Type'}>{type}</ValueWithLabel>
      <ValueWithLabel label={'Details'}>{details}</ValueWithLabel>
    </KeyValuePairs>
  );
}
