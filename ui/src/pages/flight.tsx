import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ContentLayout, Header } from '@cloudscape-design/components';
import { CodeView } from '@cloudscape-design/code-view';
import jsonHighlight from '@cloudscape-design/code-view/highlight/json';
import { useHttpClient } from '../components/util/context/http-client';
import { JsonType } from '../lib/api/api.model';
import { catchNotify, useAppControls } from '../components/util/context/app-controls';
import { expectSuccess } from '../lib/api/api';

export function FlightView() {
  const { id } = useParams();
  if (!id) {
    throw new Error();
  }

  const { notification } = useAppControls();
  const { apiClient } = useHttpClient();
  const [result, setResult] = useState<JsonType>({});

  useEffect(() => {
    (async () => {
      setResult(expectSuccess(await apiClient.raw(`/data/flight/${encodeURIComponent(id)}`)).body);
    })()
      .catch(catchNotify(notification));
  }, [id]);

  return (
    <ContentLayout header={<Header variant={'h1'}>Flight Detail</Header>}>
      <CodeView content={JSON.stringify(result, null, 2)} highlight={jsonHighlight} lineNumbers={true} />
    </ContentLayout>
  )
}
