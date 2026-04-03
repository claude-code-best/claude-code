/**
 * Example: How to use i18n in components
 * 
 * Usage in a component:
 * 
 * import { t } from 'src/i18n';
 * 
 * function MyComponent() {
 *   return (
 *     <Box>
 *       <Text>{t('common.loading')}</Text>
 *       <Text>{t('notifications.noImage', { shortcut: 'Ctrl+V' })}</Text>
 *     </Box>
 *   );
 * }
 */

// For components using React:
// import { t } from 'src/i18n';

// For non-React utilities:
// import { t } from 'src/i18n';

// Example translations available:
//
// Common:
//   t('common.loading')      => "加载中..." (zh-CN) / "Loading..." (en-US)
//   t('common.confirm')      => "确认" / "Confirm"
//   t('common.cancel')       => "取消" / "Cancel"
//
// Chat:
//   t('chat.input.placeholder') => "输入消息或 '/' 查看命令..."
//   t('chat.noImageInClipboard') => "剪贴板中没有图片"
//
// Permissions:
//   t('permissions.title')   => "权限请求" / "Permission Request"
//   t('permissions.allow')   => "允许" / "Allow"
//
// Settings:
//   t('settings.title')      => "设置" / "Settings"
//   t('settings.general')    => "通用" / "General"
//
// With parameters:
//   t('notifications.noImage', { shortcut: 'Ctrl+V' })
//   => "剪贴板中没有图片。使用 Ctrl+V 粘贴图片。"

// To change locale at runtime:
// import { setLocale } from 'src/i18n';
// setLocale('zh-CN');

// To get current locale:
// import { getLocale } from 'src/i18n';
// const locale = getLocale();

export {};
