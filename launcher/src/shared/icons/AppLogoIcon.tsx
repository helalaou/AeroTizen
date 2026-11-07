interface Props {
  class: string;
  colour: string;
  path: string;
}

export const AppLogoIcon = ({ path, colour, class: className }: Props) => (
  <svg class={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d={path} fill={colour} />
  </svg>
);
