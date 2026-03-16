INCLUDE c:\Users\USER\.vscode\extensions\istareatscreens.masm-runner-0.9.1\native\irvine\Irvine32.inc

.data
t_isLetter   BYTE "Testing: isLetter('",0
t_isUpper    BYTE "Testing: isUppercase('",0
t_isLower    BYTE "Testing: isLowercase('",0
t_close      BYTE "')? ",0

trueStr      BYTE "True",0
falseStr     BYTE "False",0

origLabel    BYTE "Original String: ",0
upperLabel   BYTE "Uppercased: ",0
lowerLabel   BYTE "Lowercased: ",0

origStr      BYTE "This is a test 1 2 3 4",0
workStr      BYTE LENGTHOF origStr DUP(0)

.code

;isLetter
;Receives:
;AL = character
;Returns:
;CF = 1 if letter, CF = 0 otherwise
;Preserves:
;EAX
isLetter PROC
push eax

cmp al, 'A'
jb checkLower
cmp al, 'Z'
jbe yesLetter

checkLower:
cmp al, 'a'
jb noLetter
cmp al, 'z'
jbe yesLetter

noLetter:
clc
pop eax
ret

yesLetter:
stc
pop eax
ret
isLetter ENDP

;isUppercase
;Receives:
;AL = character
;Returns:
;CF = 1 if uppercase letter, CF = 0 otherwise
;Preserves:
;EAX
isUppercase PROC
push eax

call isLetter
jnc notUpper

;Uppercase if bit 5 is clear (0x20)
mov ah, al
and ah, 20h
cmp ah, 0
je upperYes

notUpper:
clc
pop eax
ret

upperYes:
stc
pop eax
ret
isUppercase ENDP

;isLowercase
;Receives:
;AL = character
;Returns:
;CF = 1 if lowercase letter, CF = 0 otherwise
;Preserves:
;EAX
isLowercase PROC
push eax

call isLetter
jnc notLower

;Lowercase if bit 5 is set (0x20)
mov ah, al
and ah, 20h
cmp ah, 0
jne lowerYes

notLower:
clc
pop eax
ret

lowerYes:
stc
pop eax
ret
isLowercase ENDP

;toUppercase
;Receives:
;ESI = offset of string
;ECX = length of string
;Returns:
;nothing
;Preserves:
;EAX, ESI, ECX
toUppercase PROC
push eax
push esi
push ecx

upperLoop:
cmp ecx, 0
je upperDone

mov al, [esi]
call isLetter
jnc upperSkip

;Clear bit 5 to make uppercase: AND with 0DFh
and al, 0DFh
mov [esi], al

upperSkip:
inc esi
dec ecx
jmp upperLoop

upperDone:
pop ecx
pop esi
pop eax
ret
toUppercase ENDP

;toLowercase
;Receives:
;ESI = offset of string
;ECX = length of string
;Returns:
;nothing
;Preserves:
;EAX, ESI, ECX
toLowercase PROC
push eax
push esi
push ecx

lowerLoop:
cmp ecx, 0
je lowerDone

mov al, [esi]
call isLetter
jnc lowerSkip

;Set bit 5 to make lowercase: OR with 20h
or al, 20h
mov [esi], al

lowerSkip:
inc esi
dec ecx
jmp lowerLoop

lowerDone:
pop ecx
pop esi
pop eax
ret
toLowercase ENDP

main PROC

;----- Tests (match screenshot style) -----

;1) isLetter('A')
mov edx, OFFSET t_isLetter
call WriteString
mov al, 'A'
call WriteChar
mov edx, OFFSET t_close
call WriteString
mov al, 'A'
call isLetter
jc T1_true
mov eax, 0Ch
call SetTextColor
mov edx, OFFSET falseStr
call WriteString
jmp T1_done
T1_true:
mov eax, 0Ah
call SetTextColor
mov edx, OFFSET trueStr
call WriteString
T1_done:
mov eax, 07h
call SetTextColor
call Crlf

;2) isLetter('g')
mov edx, OFFSET t_isLetter
call WriteString
mov al, 'g'
call WriteChar
mov edx, OFFSET t_close
call WriteString
mov al, 'g'
call isLetter
jc T2_true
mov eax, 0Ch
call SetTextColor
mov edx, OFFSET falseStr
call WriteString
jmp T2_done
T2_true:
mov eax, 0Ah
call SetTextColor
mov edx, OFFSET trueStr
call WriteString
T2_done:
mov eax, 07h
call SetTextColor
call Crlf

;3) isLetter('%')
mov edx, OFFSET t_isLetter
call WriteString
mov al, '%'
call WriteChar
mov edx, OFFSET t_close
call WriteString
mov al, '%'
call isLetter
jc T3_true
mov eax, 0Ch
call SetTextColor
mov edx, OFFSET falseStr
call WriteString
jmp T3_done
T3_true:
mov eax, 0Ah
call SetTextColor
mov edx, OFFSET trueStr
call WriteString
T3_done:
mov eax, 07h
call SetTextColor
call Crlf

;4) isLetter('5')
mov edx, OFFSET t_isLetter
call WriteString
mov al, '5'
call WriteChar
mov edx, OFFSET t_close
call WriteString
mov al, '5'
call isLetter
jc T4_true
mov eax, 0Ch
call SetTextColor
mov edx, OFFSET falseStr
call WriteString
jmp T4_done
T4_true:
mov eax, 0Ah
call SetTextColor
mov edx, OFFSET trueStr
call WriteString
T4_done:
mov eax, 07h
call SetTextColor
call Crlf

;5) isUppercase('A')
mov edx, OFFSET t_isUpper
call WriteString
mov al, 'A'
call WriteChar
mov edx, OFFSET t_close
call WriteString
mov al, 'A'
call isUppercase
jc T5_true
mov eax, 0Ch
call SetTextColor
mov edx, OFFSET falseStr
call WriteString
jmp T5_done
T5_true:
mov eax, 0Ah
call SetTextColor
mov edx, OFFSET trueStr
call WriteString
T5_done:
mov eax, 07h
call SetTextColor
call Crlf

;6) isLowercase('A')
mov edx, OFFSET t_isLower
call WriteString
mov al, 'A'
call WriteChar
mov edx, OFFSET t_close
call WriteString
mov al, 'A'
call isLowercase
jc T6_true
mov eax, 0Ch
call SetTextColor
mov edx, OFFSET falseStr
call WriteString
jmp T6_done
T6_true:
mov eax, 0Ah
call SetTextColor
mov edx, OFFSET trueStr
call WriteString
T6_done:
mov eax, 07h
call SetTextColor
call Crlf

;7) isUppercase('a')
mov edx, OFFSET t_isUpper
call WriteString
mov al, 'a'
call WriteChar
mov edx, OFFSET t_close
call WriteString
mov al, 'a'
call isUppercase
jc T7_true
mov eax, 0Ch
call SetTextColor
mov edx, OFFSET falseStr
call WriteString
jmp T7_done
T7_true:
mov eax, 0Ah
call SetTextColor
mov edx, OFFSET trueStr
call WriteString
T7_done:
mov eax, 07h
call SetTextColor
call Crlf

;8) isLowercase('a')
mov edx, OFFSET t_isLower
call WriteString
mov al, 'a'
call WriteChar
mov edx, OFFSET t_close
call WriteString
mov al, 'a'
call isLowercase
jc T8_true
mov eax, 0Ch
call SetTextColor
mov edx, OFFSET falseStr
call WriteString
jmp T8_done
T8_true:
mov eax, 0Ah
call SetTextColor
mov edx, OFFSET trueStr
call WriteString
T8_done:
mov eax, 07h
call SetTextColor
call Crlf

;9) isUppercase('%')
mov edx, OFFSET t_isUpper
call WriteString
mov al, '%'
call WriteChar
mov edx, OFFSET t_close
call WriteString
mov al, '%'
call isUppercase
jc T9_true
mov eax, 0Ch
call SetTextColor
mov edx, OFFSET falseStr
call WriteString
jmp T9_done
T9_true:
mov eax, 0Ah
call SetTextColor
mov edx, OFFSET trueStr
call WriteString
T9_done:
mov eax, 07h
call SetTextColor
call Crlf

;10) isLowercase('%')
mov edx, OFFSET t_isLower
call WriteString
mov al, '%'
call WriteChar
mov edx, OFFSET t_close
call WriteString
mov al, '%'
call isLowercase
jc T10_true
mov eax, 0Ch
call SetTextColor
mov edx, OFFSET falseStr
call WriteString
jmp T10_done
T10_true:
mov eax, 0Ah
call SetTextColor
mov edx, OFFSET trueStr
call WriteString
T10_done:
mov eax, 07h
call SetTextColor
call Crlf

;11) isUppercase('5')
mov edx, OFFSET t_isUpper
call WriteString
mov al, '5'
call WriteChar
mov edx, OFFSET t_close
call WriteString
mov al, '5'
call isUppercase
jc T11_true
mov eax, 0Ch
call SetTextColor
mov edx, OFFSET falseStr
call WriteString
jmp T11_done
T11_true:
mov eax, 0Ah
call SetTextColor
mov edx, OFFSET trueStr
call WriteString
T11_done:
mov eax, 07h
call SetTextColor
call Crlf

;12) isLowercase('5')
mov edx, OFFSET t_isLower
call WriteString
mov al, '5'
call WriteChar
mov edx, OFFSET t_close
call WriteString
mov al, '5'
call isLowercase
jc T12_true
mov eax, 0Ch
call SetTextColor
mov edx, OFFSET falseStr
call WriteString
jmp T12_done
T12_true:
mov eax, 0Ah
call SetTextColor
mov edx, OFFSET trueStr
call WriteString
T12_done:
mov eax, 07h
call SetTextColor
call Crlf

;----- String conversion test -----

;Original string
mov edx, OFFSET origLabel
call WriteString
mov edx, OFFSET origStr
call WriteString
call Crlf

;Copy origStr to workStr
mov esi, OFFSET origStr
mov edi, OFFSET workStr
copyLoop:
mov al, [esi]
mov [edi], al
cmp al, 0
je copyDone
inc esi
inc edi
jmp copyLoop
copyDone:

;Uppercase
mov esi, OFFSET workStr
mov ecx, LENGTHOF origStr
dec ecx
call toUppercase

mov edx, OFFSET upperLabel
call WriteString
mov edx, OFFSET workStr
call WriteString
call Crlf

;Lowercase
mov esi, OFFSET workStr
mov ecx, LENGTHOF origStr
dec ecx
call toLowercase

mov edx, OFFSET lowerLabel
call WriteString
mov edx, OFFSET workStr
call WriteString
call Crlf

exit
main ENDP

END main