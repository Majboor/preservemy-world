import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function IconBase({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function MapScreenIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M9 18 3 21V6l6-3 6 3 6-3v15l-6 3-6-3Z" />
      <path d="M9 3v15" />
      <path d="M15 6v15" />
    </IconBase>
  );
}

export function RoutesScreenIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="5" cy="19" r="2" />
      <circle cx="19" cy="5" r="2" />
      <path d="M7 19h4a4 4 0 0 0 0-8H9a4 4 0 0 1 0-8h8" />
    </IconBase>
  );
}

export function SocialScreenIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M16 11a2.6 2.6 0 0 0 .4-5.1" />
      <path d="M18.5 20a4.2 4.2 0 0 0-3.1-4" />
    </IconBase>
  );
}

export function HomeScreenIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m3 11 9-8 9 8" />
      <path d="M5 10v10h14V10" />
      <path d="M9 20v-6h6v6" />
    </IconBase>
  );
}

export function RunsScreenIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 6v6l4 2" />
      <circle cx="12" cy="13" r="8" />
      <path d="M9 2h6" />
      <path d="M15 2v3" />
    </IconBase>
  );
}

export function MoreScreenIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
      <circle cx="7" cy="7" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="17" cy="17" r="1" fill="currentColor" stroke="none" />
    </IconBase>
  );
}

export function CfgScreenIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3" />
      <path d="M12 19v3" />
      <path d="M2 12h3" />
      <path d="M19 12h3" />
      <path d="m4.9 4.9 2.1 2.1" />
      <path d="m17 17 2.1 2.1" />
      <path d="m19.1 4.9-2.1 2.1" />
      <path d="m7 17-2.1 2.1" />
    </IconBase>
  );
}

export function MarkerIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 21s6-5.1 6-11a6 6 0 0 0-12 0c0 5.9 6 11 6 11Z" />
      <circle cx="12" cy="10" r="2" />
    </IconBase>
  );
}

export function TargetIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2" />
      <path d="M12 2v3" />
      <path d="M12 19v3" />
      <path d="M2 12h3" />
      <path d="M19 12h3" />
    </IconBase>
  );
}

export function RingIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="6" />
      <path d="M12 6v3" />
      <path d="M12 15v3" />
    </IconBase>
  );
}

export function EntryIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 4h10v16H4Z" />
      <path d="M14 8h4l2 4-2 4h-4" />
      <path d="M9 12h.01" />
    </IconBase>
  );
}
