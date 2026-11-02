import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 10,
  duration: '10s',
};

export default function () {
  const res = http.get('http://localhost:6100/api/v1/upi/compatibility');
  check(res, {
    'status is 200': (r) => r.status === 200,
    'has scheme': (r) => {
      try { return JSON.parse(r.body).scheme === 'upi://pay'; } catch { return false; }
    },
  });
}
