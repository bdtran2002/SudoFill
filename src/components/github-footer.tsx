import { ExternalLink } from 'lucide-react';

const GITHUB_REPO_URL = 'https://github.com/bdtran2002/SudoFill';

export function GithubFooter({ className = '' }: { className?: string }) {
  return (
    <footer className={`flex items-center justify-center ${className}`}>
      <a
        className='inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted transition-colors hover:text-accent'
        href={GITHUB_REPO_URL}
        rel='noreferrer'
        target='_blank'
      >
        GitHub repo
        <ExternalLink className='h-3 w-3' />
      </a>
    </footer>
  );
}
