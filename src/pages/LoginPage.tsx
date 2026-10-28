import { useNavigate, useSearchParams } from 'react-router-dom';
import { googleLoginUrl, isMockLogin } from '../api/me';
import { GoogleIcon } from '../components/icons';
import './LoginPage.css';

/* 백엔드가 /login?error=CODE 로 돌려보냄 (docs/api/01-auth.md 2.2) */
const ERRORS: Record<string, string> = {
  DOMAIN_NOT_ALLOWED: '학교 구글 계정(@bssm.hs.kr)으로 로그인해 주세요.',
  NOT_REGISTERED: '등록되지 않은 계정입니다. 담당 선생님께 문의하세요.',
  AUTH_FAILED: '로그인 중 문제가 발생했습니다. 다시 시도하세요.',
  GOOGLE_UNAVAILABLE: '로그인 중 문제가 발생했습니다. 다시 시도하세요.',
};

export default function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const code = params.get('error') ?? '';
  const error = ERRORS[code];
  const redirect = params.get('redirect');

  const login = () => {
    if (isMockLogin) navigate(redirect && redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/ranking');
    else window.location.href = googleLoginUrl(redirect);
  };

  return (
    <div className="login">
      <section className="login-l">
        <div className="login-brand">
          <span className="logo-mark" aria-hidden="true">›</span>
          <b>BSM</b><span className="muted">부산소프트웨어마이스터고</span>
        </div>
        <div className="login-hero">
          <h1>쌓은 만큼,<br />기록됩니다.</h1>
          <p>마이스터 역량 점수, 상벌점, 대회 정보를 한곳에서 확인하세요. 증빙자료를 올리면 선생님이 검토 후 점수를 반영합니다.</p>
        </div>
        <ul className="login-feat">
          <li>마역량 랭킹</li><li>상벌점 조회</li><li>대회 추천</li><li>자진 신고</li>
        </ul>
      </section>

      <main className="login-r">
        <div className="login-box">
          <h2>로그인</h2>
          <p className="muted">학교 구글 계정 하나로 바로 시작합니다. 별도 가입이나 비밀번호는 없습니다.</p>
          {error && (
            <div className="login-error" role="alert">
              <span>{error}</span>
              {code === 'GOOGLE_UNAVAILABLE' && <button type="button" className="linkbtn" onClick={login}>다시 시도</button>}
            </div>
          )}
          <button type="button" className="btn login-google" onClick={login}>
            <GoogleIcon />학교 구글 계정으로 로그인
          </button>
          <p className="login-domain">@bssm.hs.kr 계정만 사용할 수 있어요.</p>
          <hr />
          <p className="footnote">로그인하면 학교 명단과 계정이 연결됩니다. 등록되지 않은 계정이면 담당 선생님께 문의하세요.</p>
        </div>
      </main>
    </div>
  );
}
