import { X } from 'lucide-react';
import type { InputHTMLAttributes, ReactNode, Ref } from 'react';
import { classNames } from '@/lib/format';
import styles from './TokenInput.module.css';

interface TokenInputToken {
  key: string;
  label: string;
}

interface TokenListProps {
  tokens: readonly TokenInputToken[];
  maxVisible?: number;
  onRemove?: (key: string) => void;
}

interface TokenInputProps extends TokenListProps {
  inputValue: string;
  onInputValueChange: (value: string) => void;
  inputRef?: Ref<HTMLInputElement>;
  inputProps?: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>;
  renderInput?: (
    props: InputHTMLAttributes<HTMLInputElement>,
    ref: Ref<HTMLInputElement> | undefined,
  ) => ReactNode;
  layout?: 'inline' | 'stacked' | 'mobile';
  className?: string;
}

export function TokenList({
  tokens,
  maxVisible = Number.POSITIVE_INFINITY,
  onRemove,
}: TokenListProps) {
  const visibleTokens = tokens.slice(0, maxVisible);
  const hiddenCount = tokens.length - visibleTokens.length;

  return (
    <>
      {visibleTokens.map((token) => (
        <SelectionToken token={token} onRemove={onRemove} key={token.key} />
      ))}
      {hiddenCount > 0 && <span className={styles.more}>+{hiddenCount}</span>}
    </>
  );
}

export function TokenInput({
  tokens,
  maxVisible,
  onRemove,
  inputValue,
  onInputValueChange,
  inputRef,
  inputProps,
  renderInput,
  layout = 'inline',
  className,
}: TokenInputProps) {
  const resolvedInputProps: InputHTMLAttributes<HTMLInputElement> = {
    ...inputProps,
    className: classNames(styles.input, inputProps?.className),
    value: inputValue,
    onChange: (event) => onInputValueChange(event.target.value),
  };

  return (
    <div className={classNames(styles.root, layout !== 'inline' && styles[layout], className)}>
      <TokenList tokens={tokens} maxVisible={maxVisible} onRemove={onRemove} />
      {renderInput ? (
        renderInput(resolvedInputProps, inputRef)
      ) : (
        <input {...resolvedInputProps} ref={inputRef} />
      )}
    </div>
  );
}

function SelectionToken({
  token,
  onRemove,
}: {
  token: TokenInputToken;
  onRemove?: (key: string) => void;
}) {
  const content = (
    <>
      <span className={styles.tokenLabel}>{token.label}</span>
      {onRemove && <X size={11} aria-hidden='true' />}
    </>
  );

  if (onRemove) {
    return (
      <button
        type='button'
        className={styles.token}
        aria-label={`Remove ${token.label}`}
        onClick={() => onRemove(token.key)}
      >
        {content}
      </button>
    );
  }

  return <span className={styles.token}>{content}</span>;
}
