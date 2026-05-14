import React from 'react';
import { Tabs } from 'expo-router';
import { Compass, CircleCheck, Trophy, Medal, User } from 'lucide-react-native';
import { Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function TabIcon({
  focused,
  color,
  Icon,
}: {
  focused: boolean;
  color: string;
  Icon: React.ComponentType<{ color: string; size?: number; strokeWidth?: number }>;
}) {
  return <Icon color={color} size={focused ? 26 : 24} strokeWidth={focused ? 2.5 : 2.2} />;
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const hasBottomInset = insets.bottom > 0;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: '#ffffff',
        tabBarInactiveTintColor: '#8f95a8',
        tabBarStyle: {
          position: 'absolute',
          left: 12,
          right: 12,
          bottom: hasBottomInset ? insets.bottom : 8,
          borderTopWidth: 0,
          borderRadius: 28,
          height: 60,
          paddingBottom: hasBottomInset ? insets.bottom : 0,
          paddingTop: 8,
          backgroundColor: '#11131a',
          shadowColor: '#000000',
          shadowOpacity: 0.28,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: 10,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        tabBarButton: ({ ref: _ref, ...props }) => (
          <Pressable {...props} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} />
        ),
      }}>
      <Tabs.Screen
        name="find"
        options={{
          title: 'Find',
          tabBarIcon: ({ focused, color }) => <TabIcon focused={focused} color={color} Icon={Compass} />,
        }}
      />
      <Tabs.Screen
        name="active"
        options={{
          title: 'Active',
          tabBarIcon: ({ focused, color }) => <TabIcon focused={focused} color={color} Icon={CircleCheck} />,
        }}
      />
      <Tabs.Screen
        name="archive"
        options={{
          title: 'Archive',
          tabBarIcon: ({ focused, color }) => <TabIcon focused={focused} color={color} Icon={Trophy} />,
        }}
      />
      <Tabs.Screen
        name="ranks"
        options={{
          title: 'Ranks',
          tabBarIcon: ({ focused, color }) => <TabIcon focused={focused} color={color} Icon={Medal} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused, color }) => <TabIcon focused={focused} color={color} Icon={User} />,
        }}
      />
    </Tabs>
  );
}
