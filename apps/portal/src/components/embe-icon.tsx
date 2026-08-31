import Image from "next/image";

const paths = {
  home: <><path d="M3.5 10.5 12 3.6l8.5 6.9" /><path d="M5.8 9.6V20.4h12.4V9.6M9.6 20.4v-6.2h4.8v6.2" /></>,
  write: <><path d="M4 20h4L19 9l-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></>,
  care: <><path d="M12 20.5S4.5 16.2 4.5 10.4A4.2 4.2 0 0 1 12 7.8a4.2 4.2 0 0 1 7.5 2.6c0 5.8-7.5 10.1-7.5 10.1Z" /></>,
  memory: <><rect x="3.5" y="5.5" width="17" height="13" rx="2.5" /><circle cx="8.8" cy="10.2" r="1.7" /><path d="m4.5 16.5 4-3.8 2.8 2.6 3.4-3.2 5 5" /></>,
  supply: <><path d="M5.5 8h13l-1 12.5h-11L5.5 8Z" /><path d="M9 8V6.2a3 3 0 0 1 6 0V8M9.5 13.5h5" /></>,
  assistant: <><path d="M12 4.5a7.5 7.5 0 0 0-6 12l-1 3.5 3.7-1a7.5 7.5 0 1 0 3.3-14.5Z" /><path d="M9.2 12h.01M12 12h.01M14.8 12h.01" /></>,
  guide: <><circle cx="12" cy="12" r="8.2" /><path d="M9.8 9.8a2.3 2.3 0 1 1 2.9 2.6c-.5.2-.7.6-.7 1.1v.4" /><path d="M12 17h.01" /></>,
  arrow: <><path d="m9 5.5 6.5 6.5L9 18.5" /></>,
  check: <><path d="m4.5 12.5 5 5 10-11" /></>,
  close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  minus: <><path d="M5.5 12h13" /></>,
  plus: <><path d="M12 5.5v13M5.5 12h13" /></>,
  add: <><circle cx="12" cy="12" r="8.2" /><path d="M12 8.6v6.8M8.6 12h6.8" /></>,
  refresh: <><path d="M20 12a8 8 0 1 1-2.6-5.9" /><path d="M20.2 4.5v4.4h-4.4" /></>,
  alert: <><path d="M12 4.6 3.4 19.4h17.2L12 4.6Z" /><path d="M12 10v4.2M12 17h.01" /></>,
  sleep: <><path d="M19.6 14.4A7.6 7.6 0 0 1 9.6 4.4a8 8 0 1 0 10 10Z" /></>,
  milk: <><path d="M9 3.5h6v2.8l2 3.6v10.6H7V9.9l2-3.6V3.5Z" /><path d="M7 13.4h10" /></>,
  room: <><path d="M12 3.5v11" /><circle cx="12" cy="17.5" r="3" /><path d="M15.5 6.5h3.5M15.5 10h3.5" /></>,
  album: <><path d="M6.5 4.5h11a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2Z" /><path d="M9 4.5v17M12.5 9h4M12.5 12.5h4" /></>,
  thread: <><path d="M4 18c4.5 0 4.5-12 9-12s4.5 12 7 12" /><circle cx="8.5" cy="12" r="1.4" /></>
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, className = "icon" }: { name: IconName; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {paths[name]}
    </svg>
  );
}

/** Dấu EmBe: một sợi chỉ khép vòng và một chấm nắng, lấy từ biểu tượng gốc. */
export function EmBeMark({ className = "wordmark-mark" }: { className?: string }) {
  return <Image alt="" aria-hidden="true" className={className} height={52} src="/icon-192.png" width={52} />;
}
