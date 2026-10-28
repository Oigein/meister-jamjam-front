import { Link } from 'react-router-dom';

export default function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="page-msg">
      <h1>{title}</h1>
      <p>주소를 다시 확인해 주세요.</p>
      <p><Link to="/ranking">랭킹으로 이동</Link></p>
    </div>
  );
}
