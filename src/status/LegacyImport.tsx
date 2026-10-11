import { useEffect, useState } from 'react';
import { hasStatusData, importLegacyStatusData } from '../shared/migrate';

// 새 DB(test-e7132)에 시험 현황 데이터가 하나도 없을 때만 보이는 1회성 이전 안내 카드
export default function LegacyImport() {
  const [state, setState] = useState<'checking' | 'empty' | 'running' | 'done' | 'hidden' | 'error'>('checking');
  const [message, setMessage] = useState('');

  useEffect(() => {
    hasStatusData()
      .then((has) => setState(has ? 'hidden' : 'empty'))
      .catch((e) => {
        setState('error');
        setMessage('데이터 확인 실패: ' + e.message);
      });
  }, []);

  const run = async () => {
    if (!confirm('기존 시험 현황 자동화 DB의 데이터를 통합 DB로 복사합니다.\n원본 데이터는 삭제되지 않습니다. 진행할까요?')) return;
    setState('running');
    try {
      const ids = await importLegacyStatusData((done, total, id) => setMessage(`${done}/${total} 복사 중… (${id})`));
      setState('done');
      setMessage(`${ids.length}개 문서를 가져왔습니다. 새로고침하면 반영됩니다.`);
    } catch (e: any) {
      setState('error');
      setMessage('가져오기 실패: ' + e.message);
    }
  };

  if (state === 'checking' || state === 'hidden') return null;

  return (
    <div className="card" style={{ borderLeft: '4px solid var(--amber)' }}>
      <div className="card-head">
        <h2>기존 데이터 가져오기</h2>
      </div>
      <p style={{ margin: '8px 0 12px', color: 'var(--muted)' }}>
        통합 DB에 시험 현황 데이터가 아직 없습니다. 예전 &lsquo;시험 현황 자동화 시스템&rsquo;에 저장된 학생 선택과목·설정 데이터를 한 번 복사해 오세요.
      </p>
      {state === 'empty' && (
        <button className="btn" onClick={run}>
          기존 데이터 가져오기
        </button>
      )}
      {state === 'done' && (
        <button className="btn" onClick={() => location.reload()}>
          새로고침
        </button>
      )}
      {message && <p style={{ marginTop: 10, fontWeight: 600 }}>{message}</p>}
    </div>
  );
}
