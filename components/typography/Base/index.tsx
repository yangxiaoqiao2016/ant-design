import * as React from 'react';
import classNames from 'classnames';
import useMergedState from 'rc-util/lib/hooks/useMergedState';
import toArray from 'rc-util/lib/Children/toArray';
import copy from 'copy-to-clipboard';
import omit from 'rc-util/lib/omit';
import { composeRef } from 'rc-util/lib/ref';
import EditOutlined from '@ant-design/icons/EditOutlined';
import CheckOutlined from '@ant-design/icons/CheckOutlined';
import CopyOutlined from '@ant-design/icons/CopyOutlined';
import ResizeObserver from 'rc-resize-observer';
import { AutoSizeType } from 'rc-textarea/lib/ResizableTextArea';
import { ConfigContext } from '../../config-provider';
import { useLocaleReceiver } from '../../locale-provider/LocaleReceiver';
import TransButton from '../../_util/transButton';
import { isStyleSupport } from '../../_util/styleChecker';
import Tooltip from '../../tooltip';
import Typography, { TypographyProps } from '../Typography';
import Editable from '../Editable';
import useMergedConfig from '../hooks/useMergedConfig';
import useUpdatedEffect from '../hooks/useUpdatedEffect';
import Ellipsis from './Ellipsis';
import EllipsisTooltip from './EllipsisTooltip';

export type BaseType = 'secondary' | 'success' | 'warning' | 'danger';

const isLineClampSupport = isStyleSupport('webkitLineClamp');
const isTextOverflowSupport = isStyleSupport('textOverflow');

interface CopyConfig {
  text?: string;
  onCopy?: () => void;
  icon?: React.ReactNode;
  tooltips?: boolean | React.ReactNode;
}

interface EditConfig {
  editing?: boolean;
  icon?: React.ReactNode;
  tooltip?: boolean | React.ReactNode;
  onStart?: () => void;
  onChange?: (value: string) => void;
  onCancel?: () => void;
  onEnd?: () => void;
  maxLength?: number;
  autoSize?: boolean | AutoSizeType;
  triggerType?: ('icon' | 'text')[];
  enterIcon?: React.ReactNode;
}

export interface EllipsisConfig {
  rows?: number;
  expandable?: boolean;
  suffix?: string;
  symbol?: React.ReactNode;
  onExpand?: React.MouseEventHandler<HTMLElement>;
  onEllipsis?: (ellipsis: boolean) => void;
  tooltip?: React.ReactNode;
}

export interface BlockProps extends TypographyProps {
  title?: string;
  editable?: boolean | EditConfig;
  copyable?: boolean | CopyConfig;
  type?: BaseType;
  disabled?: boolean;
  ellipsis?: boolean | EllipsisConfig;
  // decorations
  code?: boolean;
  mark?: boolean;
  underline?: boolean;
  delete?: boolean;
  strong?: boolean;
  keyboard?: boolean;
  italic?: boolean;
}

function wrapperDecorations(
  { mark, code, underline, delete: del, strong, keyboard, italic }: BlockProps,
  content: React.ReactNode,
) {
  let currentContent = content;

  function wrap(needed: boolean | undefined, tag: string) {
    if (!needed) return;

    currentContent = React.createElement(tag, {}, currentContent);
  }

  wrap(strong, 'strong');
  wrap(underline, 'u');
  wrap(del, 'del');
  wrap(code, 'code');
  wrap(mark, 'mark');
  wrap(keyboard, 'kbd');
  wrap(italic, 'i');

  return currentContent;
}

function getNode(dom: React.ReactNode, defaultNode: React.ReactNode, needDom?: boolean) {
  if (dom === true || dom === undefined) {
    return defaultNode;
  }
  return dom || (needDom && defaultNode);
}

function toList<T>(val: T | T[]): T[] {
  return Array.isArray(val) ? val : [val];
}

interface InternalBlockProps extends BlockProps {
  component: string;
}

const ELLIPSIS_STR = '...';

const Base = React.forwardRef((props: InternalBlockProps, ref: any) => {
  const {
    prefixCls: customizePrefixCls,
    className,
    style,
    type,
    disabled,
    children,
    ellipsis,
    editable,
    copyable,
    component,
    ...restProps
  } = props;
  const { getPrefixCls, direction } = React.useContext(ConfigContext);
  const textLocale = useLocaleReceiver('Text')[0]!; // Force TS get this

  const typographyRef = React.useRef<HTMLElement>(null);
  const editIconRef = React.useRef<HTMLDivElement>(null);

  // ============================ MISC ============================
  const prefixCls = getPrefixCls('typography', customizePrefixCls);

  const textProps = omit(restProps, [
    'mark',
    'code',
    'delete',
    'underline',
    'strong',
    'keyboard',
    'italic',
  ]) as any;

  // ========================== Editable ==========================
  const [enableEdit, editConfig] = useMergedConfig<EditConfig>(editable);
  const [editing, setEditing] = useMergedState(false, {
    value: editConfig.editing,
  });
  const { triggerType = ['icon'] } = editConfig;

  const triggerEdit = (edit: boolean) => {
    if (edit) {
      editConfig.onStart?.();
    }

    setEditing(edit);
  };

  // Focus edit icon when back
  useUpdatedEffect(() => {
    if (!editing) {
      editIconRef.current?.focus();
    }
  }, [editing]);

  const onEditClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    triggerEdit(true);
  };

  const onEditChange = (value: string) => {
    editConfig.onChange?.(value);
    triggerEdit(false);
  };

  const onEditCancel = () => {
    editConfig.onCancel?.();
    triggerEdit(false);
  };

  // ========================== Copyable ==========================
  const [enableCopy, copyConfig] = useMergedConfig<CopyConfig>(copyable);
  const [copied, setCopied] = React.useState(false);
  const copyIdRef = React.useRef<NodeJS.Timeout>();

  const cleanCopyId = () => {
    clearTimeout(copyIdRef.current!);
  };

  const onCopyClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();

    if (copyConfig.text === undefined) {
      copyConfig.text = String(children);
    }
    copy(copyConfig.text || '');

    setCopied(true);

    // Trigger tips update
    cleanCopyId();
    copyIdRef.current = setTimeout(() => {
      setCopied(false);
    }, 3000);

    copyConfig.onCopy?.();
  };

  React.useEffect(() => cleanCopyId, []);

  // ========================== Ellipsis ==========================
  const [expanded, setExpanded] = React.useState(false);
  const [isJsEllipsis, setIsJsEllipsis] = React.useState(false);
  const [isNativeEllipsis, setIsNativeEllipsis] = React.useState(false);
  const [enableEllipsis, ellipsisConfig] = useMergedConfig<EllipsisConfig>(ellipsis, {
    expandable: false,
  });

  const mergedEnableEllipsis = enableEllipsis && !expanded;

  // Shared prop to reduce bundle size
  const { rows = 1 } = ellipsisConfig;

  const cssEllipsis = React.useMemo(() => {
    if (
      // Disable ellipsis
      !mergedEnableEllipsis ||
      // Provide suffix
      ellipsisConfig.suffix !== undefined ||
      ellipsisConfig.onEllipsis ||
      // Can't use css ellipsis since we need to provide the place for button
      ellipsisConfig.expandable ||
      enableEdit ||
      enableCopy
    ) {
      return false;
    }

    if (rows === 1) {
      return isTextOverflowSupport;
    }

    return isLineClampSupport;
  }, [
    mergedEnableEllipsis,
    enableEdit,
    enableCopy,
    ellipsisConfig,
    isTextOverflowSupport,
    isLineClampSupport,
  ]);

  const isMergedEllipsis = mergedEnableEllipsis && (cssEllipsis ? isNativeEllipsis : isJsEllipsis);

  const cssTextOverflow = mergedEnableEllipsis && rows === 1 && cssEllipsis;
  const cssLineClamp = mergedEnableEllipsis && rows > 1 && cssEllipsis;

  // >>>>> Expand
  const onExpandClick: React.MouseEventHandler<HTMLElement> = e => {
    setExpanded(true);
    ellipsisConfig.onExpand?.(e);
  };

  const [ellipsisWidth, setEllipsisWidth] = React.useState(0);
  const onResize = ({ offsetWidth }: { offsetWidth: number }) => {
    setEllipsisWidth(offsetWidth);
  };

  // >>>>> JS Ellipsis
  const onJsEllipsis = (jsEllipsis: boolean) => {
    setIsJsEllipsis(jsEllipsis);

    // Trigger if changed
    if (isJsEllipsis !== jsEllipsis) {
      ellipsisConfig.onEllipsis?.(jsEllipsis);
    }
  };

  // >>>>> Native ellipsis
  React.useEffect(() => {
    const textEle = typographyRef.current;

    if (enableEllipsis && cssEllipsis && textEle) {
      const currentEllipsis = textEle.offsetWidth < textEle.scrollWidth;
      if (isNativeEllipsis !== currentEllipsis) {
        setIsNativeEllipsis(currentEllipsis);
      }
    }
  }, [enableEllipsis, cssEllipsis, children]);

  // =========================== Render ===========================
  // >>>>>>>>>>> Editing input
  if (editing) {
    return (
      <Editable
        value={typeof children === 'string' ? children : ''}
        onSave={onEditChange}
        onCancel={onEditCancel}
        onEnd={editConfig.onEnd}
        prefixCls={prefixCls}
        className={className}
        style={style}
        direction={direction}
        maxLength={editConfig.maxLength}
        autoSize={editConfig.autoSize}
        enterIcon={editConfig.enterIcon}
      />
    );
  }

  // >>>>>>>>>>> Typography
  // Expand
  const renderExpand = () => {
    const { expandable, symbol } = ellipsisConfig;

    if (!expandable) return null;

    let expandContent: React.ReactNode;
    if (symbol) {
      expandContent = symbol;
    } else {
      expandContent = textLocale.expand;
    }

    return (
      <a
        key="expand"
        className={`${prefixCls}-expand`}
        onClick={onExpandClick}
        aria-label={textLocale.expand}
      >
        {expandContent}
      </a>
    );
  };

  // Edit
  const renderEdit = () => {
    if (!enableEdit) return;

    const { icon, tooltip } = editConfig;

    const title = toArray(tooltip)[0] || textLocale.edit;
    const ariaLabel = typeof title === 'string' ? title : '';

    return triggerType.includes('icon') ? (
      <Tooltip key="edit" title={tooltip === false ? '' : title}>
        <TransButton
          ref={editIconRef}
          className={`${prefixCls}-edit`}
          onClick={onEditClick}
          aria-label={ariaLabel}
        >
          {icon || <EditOutlined role="button" />}
        </TransButton>
      </Tooltip>
    ) : null;
  };

  // Copy
  const renderCopy = () => {
    if (!enableCopy) return;

    const { tooltips, icon } = copyConfig;

    const tooltipNodes = toList(tooltips);
    const iconNodes = toList(icon);

    const title = copied
      ? getNode(tooltipNodes[1], textLocale.copied)
      : getNode(tooltipNodes[0], textLocale.copy);
    const systemStr = copied ? textLocale.copied : textLocale.copy;
    const ariaLabel = typeof title === 'string' ? title : systemStr;

    return (
      <Tooltip key="copy" title={title}>
        <TransButton
          className={classNames(`${prefixCls}-copy`, copied && `${prefixCls}-copy-success`)}
          onClick={onCopyClick}
          aria-label={ariaLabel}
        >
          {copied
            ? getNode(iconNodes[1], <CheckOutlined />, true)
            : getNode(iconNodes[0], <CopyOutlined />, true)}
        </TransButton>
      </Tooltip>
    );
  };

  const renderOperations = (renderExpanded: boolean) => [
    renderExpanded && renderExpand(),
    renderEdit(),
    renderCopy(),
  ];

  const renderSuffix = (needEllipsis: boolean) => [
    needEllipsis && [ELLIPSIS_STR, ellipsisConfig.suffix],
    renderOperations(needEllipsis),
  ];

  return (
    <ResizeObserver onResize={onResize} disabled={!mergedEnableEllipsis || cssEllipsis}>
      {resizeRef => (
        <EllipsisTooltip
          title={ellipsisConfig.tooltip === true ? children : ellipsisConfig.tooltip}
          enabledEllipsis={mergedEnableEllipsis}
          isEllipsis={isMergedEllipsis}
        >
          <Typography
            className={classNames(
              {
                [`${prefixCls}-${type}`]: type,
                [`${prefixCls}-disabled`]: disabled,
                [`${prefixCls}-ellipsis`]: enableEllipsis,
                [`${prefixCls}-single-line`]: mergedEnableEllipsis && rows === 1,
                [`${prefixCls}-ellipsis-single-line`]: cssTextOverflow,
                [`${prefixCls}-ellipsis-multiple-line`]: cssLineClamp,
              },
              className,
            )}
            style={{
              ...style,
              WebkitLineClamp: cssLineClamp ? rows : undefined,
            }}
            component={component}
            ref={composeRef(resizeRef, typographyRef, ref)}
            direction={direction}
            onClick={triggerType.includes('text') ? onEditClick : null}
            {...textProps}
          >
            <Ellipsis
              enabledMeasure={mergedEnableEllipsis && !cssEllipsis}
              text={children}
              rows={rows}
              width={ellipsisWidth}
              onEllipsis={onJsEllipsis}
            >
              {(node, needEllipsis) => {
                const wrappedContext = wrapperDecorations(
                  props,
                  <>
                    {node}
                    {renderSuffix(needEllipsis)}
                  </>,
                );

                return wrappedContext;
              }}
            </Ellipsis>
          </Typography>
        </EllipsisTooltip>
      )}
    </ResizeObserver>
  );
});

export default Base;