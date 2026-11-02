export const WeatherIcon = ({ code }: { code: number | null }) => (
  <svg viewBox="0 0 24 24">
    {code === 0 || code === 1 ? (
      <>
        <circle cx="12" cy="12" r="4.5" fill="#ffd34d" />
        <g stroke="#ffd34d" stroke-width="1.8" stroke-linecap="round">
          <path d="M12 2.5v2.5M12 19v2.5M2.5 12h2.5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
        </g>
      </>
    ) : code === 2 ? (
      <>
        <circle cx="9" cy="9" r="3.6" fill="#ffd34d" />
        <path fill="#e8ecf2" d="M8 19h9.5a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.6 1.2A3 3 0 0 0 8 19z" />
      </>
    ) : code === 45 || code === 48 ? (
      <g stroke="#c9cfd8" stroke-width="2" stroke-linecap="round">
        <path d="M4 9h16M6 13h12M4 17h16" />
      </g>
    ) : code !== null && ((code >= 71 && code <= 77) || code === 85 || code === 86) ? (
      <>
        <path fill="#d5dbe4" d="M7 15h11a4 4 0 0 0 .5-8 6 6 0 0 0-11.6 1.6A3.3 3.3 0 0 0 7 15z" />
        <g fill="#fff">
          <circle cx="8" cy="19" r="1.2" />
          <circle cx="12" cy="20.5" r="1.2" />
          <circle cx="16" cy="19" r="1.2" />
        </g>
      </>
    ) : code !== null && code >= 95 ? (
      <>
        <path fill="#b9c0cc" d="M7 14h11a4 4 0 0 0 .5-8 6 6 0 0 0-11.6 1.6A3.3 3.3 0 0 0 7 14z" />
        <path fill="#ffd34d" d="M12.5 13l-3 5h2.5l-1.5 4.5 4.5-6h-2.6l1.6-3.5z" />
      </>
    ) : code !== null && code >= 51 ? (
      <>
        <path fill="#d5dbe4" d="M7 15h11a4 4 0 0 0 .5-8 6 6 0 0 0-11.6 1.6A3.3 3.3 0 0 0 7 15z" />
        <g stroke="#6cb6ff" stroke-width="1.8" stroke-linecap="round">
          <path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3" />
        </g>
      </>
    ) : (
      <path fill="#d5dbe4" d="M7 19h11a4 4 0 0 0 .5-8 6 6 0 0 0-11.6 1.6A3.3 3.3 0 0 0 7 19z" />
    )}
  </svg>
);
