import { createRoot } from 'react-dom/client';

import '../../src/styles.css';
import { MailboxPage } from '../../src/features/email/mailbox-page';

createRoot(document.getElementById('root')!).render(<MailboxPage />);
