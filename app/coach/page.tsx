import ChatThread from '@/components/coach/ChatThread';
import PageHeader from '@/components/layout/PageHeader';

export default function CoachPage() {
  return (
    <>
      <PageHeader title="Coach" accent="coach" />
      <ChatThread />
    </>
  );
}
