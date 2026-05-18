'use client';
import { useState } from 'react';
import StreakCard from '@/components/recovery/StreakCard';
import UrgeLog from '@/components/recovery/UrgeLog';
import UrgePatterns from '@/components/recovery/UrgePatterns';
import CheckIn from '@/components/recovery/CheckIn';
import CopingStrategies from '@/components/recovery/CopingStrategies';
import RelapseLog from '@/components/recovery/RelapseLog';

export default function RecoveryPage() {
  const [days, setDays] = useState(0);
  const [urgeRefreshKey, setUrgeRefreshKey] = useState(0);

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 16px 40px' }}>
      <div className="page-title">Recovery</div>
      <StreakCard onStreakChange={setDays} />
      <CheckIn days={days} />
      <UrgeLog onUrgeLogged={() => setUrgeRefreshKey(k => k + 1)} />
      <UrgePatterns refreshKey={urgeRefreshKey} />
      <CopingStrategies />
      <RelapseLog onRelapse={() => setDays(0)} />
    </div>
  );
}
