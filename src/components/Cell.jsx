import React, { useState, useEffect, useRef } from 'react';
import './Cell.css';

export default function Cell({ id, value, display, error, onUpdate }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef(null);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSubmit = () => {
    if (editValue !== value) {
      onUpdate(id, editValue);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSubmit();
    } else if (e.key === 'Escape') {
      setEditValue(value);
      setIsEditing(false);
    }
  };

  const handleBlur = () => {
    handleSubmit();
  };

  const getDisplayValue = () => {
    if (display === '#CIRCULAR' || display === '#ERROR') {
      return display;
    }
    return display || '';
  };

  const getCellClass = () => {
    let className = 'cell';
    if (isEditing) className += ' editing';
    if (error || display === '#CIRCULAR' || display === '#ERROR') className += ' error';
    return className;
  };

  return (
    <div className={getCellClass()}>
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="cell-input"
          placeholder="Enter value or formula"
        />
      ) : (
        <div
          className="cell-display"
          onClick={() => {
            setEditValue(value || '');
            setIsEditing(true);
          }}
          title={`${value || ''}${error ? `\nError: ${error}` : ''}`}
        >
          {getDisplayValue()}
        </div>
      )}
    </div>
  );
}