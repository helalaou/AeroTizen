import { useTranslation } from './hooks/useTranslation';
export const TranslatedText = ({ children }: { children: string }) => {
  const translate = useTranslation();
  return <>{translate(children)}</>;
};
