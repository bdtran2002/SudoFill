import { createRoot } from 'react-dom/client';

import '../../src/styles.css';
import { MailboxApp } from '../../src/features/email/mailbox-app';

createRoot(document.getElementById('root')!).render(<MailboxApp />);
