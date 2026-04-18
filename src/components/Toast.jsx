export default function Toast({ message, isError }) {
  return (
    <div className={`toast${isError ? ' toast-error' : ''}`}>
      {message}
    </div>
  );
}
