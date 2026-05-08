import {
  Avatar,
  Menu,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  notify,
  Tooltip,
  useConfirmModal,
} from '@affine/component';
import { useGuard } from '@affine/core/components/guard';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { DocService } from '@affine/core/modules/doc';
import {
  DocGrantedUsersService,
  type GrantedUser,
  WorkspacePermissionService,
} from '@affine/core/modules/permissions';
import { UserFriendlyError } from '@affine/error';
import { DocRole } from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import track from '@affine/track';
import { useLiveData, useService } from '@toeverything/infra';
import clsx from 'clsx';
import { useCallback, useMemo } from 'react';

import * as styles from './member-item.css';

export const MemberItem = ({
  grantedUser,
  canManageUsers,
}: {
  grantedUser: GrantedUser;
  canManageUsers: boolean;
}) => {
  const user = grantedUser.user;
  const disableManage = grantedUser.role === DocRole.Owner || !canManageUsers;

  const role = useMemo(() => {
    switch (grantedUser.role) {
      case DocRole.Owner:
        return 'Owner';
      case DocRole.Manager:
        return 'Can manage';
      case DocRole.Editor:
        return 'Can edit';
      case DocRole.Reader:
        return 'Can read';
      default:
        return '';
    }
  }, [grantedUser.role]);

  return (
    <div className={styles.memberItemStyle}>
      <div className={styles.memberContainerStyle}>
        <Avatar
          key={user.id}
          url={user.avatarUrl || ''}
          name={user.name}
          size={36}
        />
        <div className={styles.memberInfoStyle}>
          <Tooltip
            content={user.name}
            rootOptions={{ delayDuration: 1000 }}
            options={{
              className: styles.tooltipContentStyle,
            }}
          >
            <div className={styles.memberNameStyle}>{user.name}</div>
          </Tooltip>
          <Tooltip
            content={user.email}
            rootOptions={{ delayDuration: 1000 }}
            options={{
              className: styles.tooltipContentStyle,
            }}
          >
            <div className={styles.memberEmailStyle}>{user.email}</div>
          </Tooltip>
        </div>
      </div>
      {disableManage ? (
        <div className={clsx(styles.memberRoleStyle, 'disable')}>{role}</div>
      ) : (
        <Menu
          items={<Options userId={user.id} memberRole={grantedUser.role} />}
          contentOptions={{
            align: 'start',
          }}
        >
          <MenuTrigger
            variant="plain"
            className={styles.menuTriggerStyle}
            contentStyle={{
              width: '100%',
            }}
          >
            {role}
          </MenuTrigger>
        </Menu>
      )}
    </div>
  );
};

const Options = ({
  memberRole,
  userId,
}: {
  userId: string;
  memberRole: DocRole;
}) => {
  const t = useI18n();
  const docGrantedUsersService = useService(DocGrantedUsersService);
  const docService = useService(DocService);
  const workspacePermissionService = useService(WorkspacePermissionService);
  const isWorkspaceOwner = useLiveData(
    workspacePermissionService.permission.isOwner$
  );

  const { openConfirmModal } = useConfirmModal();

  const canTransferOwner =
    useGuard('Doc_TransferOwner', docService.doc.id) && !!isWorkspaceOwner;
  const canManageUsers = useGuard('Doc_Users_Manage', docService.doc.id);

  const updateUserRole = useCallback(
    async (userId: string, role: DocRole) => {
      track.$.sharePanel.$.modifyUserDocRole({ control: 'Update', role });
      try {
        const res = await docGrantedUsersService.updateUserRole(userId, role);
        if (res) {
          notify.success({
            title:
              t['com.affine.share-menu.member-management.update-success'](),
          });
        } else {
          notify.error({
            title: t['com.affine.share-menu.member-management.update-fail'](),
          });
        }
      } catch (error) {
        const err = UserFriendlyError.fromAny(error);
        notify.error({
          title: t[`error.${err.name}`](err.data),
        });
      }
    },
    [docGrantedUsersService, t]
  );

  const changeToManager = useAsyncCallback(async () => {
    await updateUserRole(userId, DocRole.Manager);
  }, [updateUserRole, userId]);

  const changeToEditor = useAsyncCallback(async () => {
    await updateUserRole(userId, DocRole.Editor);
  }, [updateUserRole, userId]);

  const changeToReader = useAsyncCallback(async () => {
    await updateUserRole(userId, DocRole.Reader);
  }, [updateUserRole, userId]);

  const changeToOwner = useAsyncCallback(async () => {
    await updateUserRole(userId, DocRole.Owner);
  }, [updateUserRole, userId]);

  const openTransferOwnerModal = useCallback(() => {
    openConfirmModal({
      title:
        t[
          'com.affine.share-menu.member-management.set-as-owner.confirm.title'
        ](),
      description:
        t[
          'com.affine.share-menu.member-management.set-as-owner.confirm.description'
        ](),
      onConfirm: changeToOwner,
      confirmText: t['Confirm'](),
      confirmButtonOptions: {
        variant: 'primary',
      },
      cancelText: t['Cancel'](),
    });
  }, [changeToOwner, openConfirmModal, t]);

  const removeMember = useAsyncCallback(async () => {
    track.$.sharePanel.$.modifyUserDocRole({ control: 'Remove' });
    try {
      await docGrantedUsersService.revokeUsersRole(userId);
      docGrantedUsersService.loadMore();
    } catch (error) {
      const err = UserFriendlyError.fromAny(error);
      notify.error({
        title: t[`error.${err.name}`](err.data),
      });
    }
  }, [docGrantedUsersService, userId, t]);

  const operationButtonInfo = useMemo(() => {
    return [
      {
        label: t['com.affine.share-menu.option.permission.can-manage'](),
        onClick: changeToManager,
        role: DocRole.Manager,
      },
      {
        label: t['com.affine.share-menu.option.permission.can-edit'](),
        onClick: changeToEditor,
        role: DocRole.Editor,
      },
      {
        label: t['com.affine.share-menu.option.permission.can-read'](),
        onClick: changeToReader,
        role: DocRole.Reader,
      },
    ];
  }, [changeToEditor, changeToManager, changeToReader, t]);

  return (
    <>
      {operationButtonInfo.map(item => (
        <MenuItem
          key={item.label}
          onSelect={item.onClick}
          selected={memberRole === item.role}
          disabled={!canManageUsers}
        >
          <div className={styles.planTagContainer}>{item.label}</div>
        </MenuItem>
      ))}
      <MenuItem onSelect={openTransferOwnerModal} disabled={!canTransferOwner}>
        {t['com.affine.share-menu.member-management.set-as-owner']()}
      </MenuItem>
      <MenuSeparator />
      <MenuItem
        onSelect={removeMember}
        type="danger"
        className={styles.remove}
        disabled={!canManageUsers}
      >
        {t['com.affine.share-menu.member-management.remove']()}
      </MenuItem>
    </>
  );
};
