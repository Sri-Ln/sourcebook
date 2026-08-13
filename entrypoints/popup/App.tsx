import { useCallback, useState } from 'react';
import { inspectActiveTab, requestDraft } from '../../lib/messaging/activeTab.js';
import { recruiterClient } from '../../lib/messaging/client.js';
import { RecruiterList } from './RecruiterList.js';
import { SaveCurrentPage } from './SaveCurrentPage.js';

export default function App() {
  // Bumped after a save so the list refetches. A key change is a blunt way to
  // refresh, but the list is small and the alternative — lifting its loading
  // state into App — would couple two things that are otherwise independent.
  const [version, setVersion] = useState(0);
  const onSaved = useCallback(() => setVersion((v) => v + 1), []);

  // Search and filtering land in #19, inline status editing in #20.
  return (
    <main className="popup">
      <h1>sourcebook</h1>

      <SaveCurrentPage
        client={recruiterClient}
        inspect={inspectActiveTab}
        requestDraft={requestDraft}
        onSaved={onSaved}
      />

      <RecruiterList key={version} client={recruiterClient} />
    </main>
  );
}
