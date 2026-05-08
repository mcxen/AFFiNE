import * as styles from './index.css';

export const UserAccountItem = ({ email }: { email: string }) => {
  return (
    <div className={styles.userAccountContainer}>
      <div className={styles.leftContainer}>
        <div className={styles.userEmail}>{email}</div>
      </div>
    </div>
  );
};
