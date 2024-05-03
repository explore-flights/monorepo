import {
  Box, Container, ContentLayout, Header
} from '@cloudscape-design/components';
import React from 'react';
import { Contact } from '../components/contact/contact';
import { useI18n } from '../components/util/context/i18n';
import { useDateFormat } from '../components/util/state/use-dateformat';

const LAST_UPDATED = new Date('2024-05-04');

export function Legal() {
  const i18n = useI18n();
  const { formatDate } = useDateFormat();

  return (
    <ContentLayout header={<Header variant={'h1'} description={`Last updated: ${formatDate(LAST_UPDATED)}`}>Legal</Header>}>
      <Container variant={'stacked'} header={<Header variant={'h2'}>Contact</Header>}>
        <Contact />
      </Container>

      <Container variant={'stacked'} header={<Header variant={'h2'}>Liability for content</Header>}>
        <Box variant={'p'}>
          We make every effort to keep the information on our site current, but accept no liability whatsoever for the content provided.
          Pursuant to §7 par. 1 of TMG (German Tele-Media Act), the law limits our responsibility as a service provider to our own content on these web pages.
          According to §8 to §10 of TMG, we are not obligated to monitor third party information provided or stored on our website or to investigate circumstances that indicate illegal activity.
          Obligations to remove or block the use of information under general law remain unaffected.
          However, liability in this regard is only possible from the moment of knowledge of a specific infringement.
          Upon notification of appropriate violations, we will remove this content immediately.
        </Box>
      </Container>

      <Container variant={'stacked'} header={<Header variant={'h2'}>Copyright</Header>}>
        <Box variant={'p'}>
          The content and works provided on these webpages are governed by the copyright laws of Germany.
          Duplication, processing, distribution, or any form of commercialisation of such material beyond the scope of the copyright law shall require the prior written consent of its respective author or creator.
        </Box>
      </Container>
    </ContentLayout>
  );
}
