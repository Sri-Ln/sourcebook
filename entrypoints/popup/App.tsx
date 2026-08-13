import { recruiterClient } from '../../lib/messaging/client.js';
import { RecruiterList } from './RecruiterList.js';

export default function App() {
  // Search and filtering land in #19, inline status editing in #20.
  return (
    <main className="popup">
      <h1>sourcebook</h1>
      <RecruiterList client={recruiterClient} />
    </main>
  );
}
