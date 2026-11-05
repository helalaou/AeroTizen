interface Props {
  colour: string;
  path: string;
}

export const AppLogoIcon = ({ path, colour }: Props) => (
  <svg class="logo" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d={path} fill={colour} />
  </svg>
);
