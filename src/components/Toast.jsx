import { Toast as BsToast, ToastContainer } from 'react-bootstrap';

export default function Toast({ message, isError }) {
  return (
    <ToastContainer position="bottom-center" className="p-3" style={{ zIndex: 1060 }}>
      <BsToast show bg={isError ? 'danger' : 'dark'}>
        <BsToast.Body className="text-white text-center fw-medium">
          {message}
        </BsToast.Body>
      </BsToast>
    </ToastContainer>
  );
}
